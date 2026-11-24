'use strict';

const stripe = require('../config/stripeClient');
const prisma = require('../config/prismaClient');
const axios = require('axios');

const APPOINTMENT_URL = (process.env.APPOINTMENT_SERVICE_URL || 'http://localhost:3003').replace(/\/+$/, '');
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;

function internalHeaders() {
  return { 'x-internal-sig': INTERNAL_SECRET };
}

/**
 * Idempotently reconciles a transaction against Stripe Checkout Session.
 * Can be called by:
 * 1. Webhook (checkout.session.completed)
 * 2. On-demand verification API when patient returns to confirmation screen
 * 3. Background reconciliation cron for missed or delayed webhooks
 */
async function reconcileCheckoutSession({ sessionId, appointmentId, transactionId, paymentIntentId }) {
  // Find transaction by any provided identifier
  const where = {};
  if (sessionId) where.stripeCheckoutSessionId = sessionId;
  else if (paymentIntentId) where.stripePaymentIntentId = paymentIntentId;
  else if (appointmentId) where.appointmentId = appointmentId;
  else if (transactionId) where.id = transactionId;
  else {
    return { success: false, message: 'No sessionId, paymentIntentId, appointmentId, or transactionId provided.' };
  }

  const transaction = await prisma.transaction.findFirst({
    where,
    include: { refunds: true },
  });

  if (!transaction) {
    return { success: false, message: 'Transaction not found in database.' };
  }

  // If already SUCCESS and paidAt is populated, ensure appointment is marked PAID and return
  if (transaction.status === 'SUCCESS' && transaction.paidAt) {
    // Best-effort ensure appointment is marked PAID (in case webhook was missed earlier)
    try {
      await axios.patch(
        `${APPOINTMENT_URL}/api/appointments/internal/${transaction.appointmentId}/payment-outcome`,
        { outcome: 'PAID' },
        { headers: internalHeaders() }
      );
    } catch (_) {}

    return {
      success: true,
      status: 'PAID',
      alreadyReconciled: true,
      transaction,
    };
  }

  // Direct Charge scoping: retrieve with connected account ID
  const retrieveOpts = transaction.stripeConnectedAccountId
    ? { stripeAccount: transaction.stripeConnectedAccountId }
    : {};

  const stripeSessionId = sessionId || transaction.stripeCheckoutSessionId;
  const targetPaymentIntentId = paymentIntentId || transaction.stripePaymentIntentId;

  // ── Flow A: In-App PaymentIntent (Direct retrieval from Stripe) ───────────────
  if (!stripeSessionId && targetPaymentIntentId) {
    let pi;
    try {
      pi = await stripe.paymentIntents.retrieve(
        targetPaymentIntentId,
        { expand: ['latest_charge.balance_transaction', 'payment_method'] },
        retrieveOpts
      );
    } catch (err) {
      console.error(`[reconcile] Failed to retrieve PaymentIntent ${targetPaymentIntentId}:`, err.message);
      return {
        success: false,
        message: `Failed to query Stripe for payment intent: ${err.message}`,
        transaction,
      };
    }

    if (pi.status === 'succeeded') {
      const latestCharge = pi.latest_charge;
      const paymentMethod = pi.payment_method;
      const stripeFeeMinor = latestCharge?.balance_transaction?.fee ?? 0;
      const grossMinor = pi.amount_received || pi.amount || Math.round(Number(transaction.grossAmount || 0) * 100);

      const paymentMethodType =
        latestCharge?.payment_method_details?.type ||
        paymentMethod?.type ||
        'card';
      const cardBrand =
        latestCharge?.payment_method_details?.card?.brand ||
        paymentMethod?.card?.brand ||
        null;
      const cardLast4 =
        latestCharge?.payment_method_details?.card?.last4 ||
        paymentMethod?.card?.last4 ||
        null;
      const receiptUrl = latestCharge?.receipt_url || null;
      const customerEmail =
        latestCharge?.billing_details?.email ||
        transaction.customerEmail ||
        null;
      const patientName =
        latestCharge?.billing_details?.name ||
        transaction.patientName ||
        null;

      const updated = await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: 'SUCCESS',
          stripePaymentIntentId: targetPaymentIntentId,
          stripeFeeAmount: stripeFeeMinor / 100,
          hospitalNetAmount: (grossMinor - stripeFeeMinor) / 100,
          paidAt: transaction.paidAt || new Date(),
          paymentMethodType,
          cardBrand,
          cardLast4,
          receiptUrl,
          customerEmail,
          ...(patientName && { patientName }),
        },
      });

      // Notify appointment service that payment is complete
      try {
        await axios.patch(
          `${APPOINTMENT_URL}/api/appointments/internal/${transaction.appointmentId}/payment-outcome`,
          { outcome: 'PAID' },
          { headers: internalHeaders() }
        );
        console.log(`[reconcile] Successfully marked appointment ${transaction.appointmentId} as PAID via PaymentIntent`);
      } catch (appErr) {
        console.error(
          `[reconcile] Failed to update appointment status to PAID for ${transaction.appointmentId}:`,
          appErr?.response?.data || appErr.message
        );
      }

      return {
        success: true,
        status: 'PAID',
        transaction: updated,
      };
    } else if (pi.status === 'canceled') {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED' },
      });
      await axios.patch(
        `${APPOINTMENT_URL}/api/appointments/internal/${transaction.appointmentId}/payment-outcome`,
        { outcome: 'FAILED' },
        { headers: internalHeaders() }
      ).catch(() => {});
      return { success: false, status: 'FAILED', message: 'PaymentIntent is canceled.', transaction };
    } else {
      return { success: false, status: 'PENDING', message: `PaymentIntent is in ${pi.status} state.`, transaction };
    }
  }

  // ── Flow B: Hosted Checkout Session (URL) ────────────────────────────────────
  if (!stripeSessionId) {
    return {
      success: false,
      message: 'No Stripe checkout session or payment intent associated with this transaction.',
      transaction,
    };
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(
      stripeSessionId,
      // Only payment_intent is expandable on a CheckoutSession.
      // payment_method and latest_charge live on the PaymentIntent — fetched below.
      { expand: ['payment_intent'] },
      retrieveOpts
    );
  } catch (err) {
    console.error(`[reconcile] Failed to retrieve Stripe session ${stripeSessionId}:`, err.message);
    return {
      success: false,
      message: `Failed to query Stripe for session: ${err.message}`,
      transaction,
    };
  }

  // Case 1: Payment succeeded on Stripe
  if (session.payment_status === 'paid') {
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id || transaction.stripePaymentIntentId;

    let latestCharge = null;
    let paymentMethod = null;

    if (session.payment_intent && typeof session.payment_intent === 'object') {
      latestCharge = session.payment_intent.latest_charge;
      paymentMethod = session.payment_intent.payment_method;
    }

    // If payment_intent wasn't fully expanded by session retrieve, fetch it directly
    if (paymentIntentId && (!latestCharge || typeof latestCharge === 'string')) {
      try {
        const pi = await stripe.paymentIntents.retrieve(
          paymentIntentId,
          { expand: ['latest_charge.balance_transaction', 'payment_method'] },
          retrieveOpts
        );
        latestCharge = pi.latest_charge;
        paymentMethod = pi.payment_method;
      } catch (piErr) {
        console.warn(`[reconcile] Could not retrieve PI ${paymentIntentId} details:`, piErr.message);
      }
    }

    const stripeFeeMinor = latestCharge?.balance_transaction?.fee ?? 0;
    const grossMinor = session.amount_total
      ? session.amount_total
      : Math.round(Number(transaction.grossAmount || 0) * 100);

    const paymentMethodType =
      latestCharge?.payment_method_details?.type ||
      paymentMethod?.type ||
      'card';
    const cardBrand =
      latestCharge?.payment_method_details?.card?.brand ||
      paymentMethod?.card?.brand ||
      null;
    const cardLast4 =
      latestCharge?.payment_method_details?.card?.last4 ||
      paymentMethod?.card?.last4 ||
      null;
    const receiptUrl = latestCharge?.receipt_url || null;
    const customerEmail =
      session.customer_details?.email ||
      latestCharge?.billing_details?.email ||
      transaction.customerEmail ||
      null;
    const patientName =
      session.customer_details?.name ||
      latestCharge?.billing_details?.name ||
      transaction.patientName ||
      null;

    const updated = await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: 'SUCCESS',
        stripePaymentIntentId: paymentIntentId,
        stripeFeeAmount: stripeFeeMinor / 100,
        hospitalNetAmount: (grossMinor - stripeFeeMinor) / 100,
        paidAt: transaction.paidAt || new Date(),
        paymentMethodType,
        cardBrand,
        cardLast4,
        receiptUrl,
        customerEmail,
        ...(patientName && { patientName }),
      },
    });

    // Notify appointment service that payment is complete
    try {
      await axios.patch(
        `${APPOINTMENT_URL}/api/appointments/internal/${transaction.appointmentId}/payment-outcome`,
        { outcome: 'PAID' },
        { headers: internalHeaders() }
      );
      console.log(`[reconcile] Successfully marked appointment ${transaction.appointmentId} as PAID`);
    } catch (appErr) {
      console.error(
        `[reconcile] Failed to update appointment status to PAID for ${transaction.appointmentId}:`,
        appErr?.response?.data || appErr.message
      );
    }

    return {
      success: true,
      status: 'PAID',
      reconciled: true,
      transaction: updated,
    };
  }

  // Case 2: Checkout expired or cancelled without payment
  if (session.status === 'expired') {
    const updated = await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED' },
    });

    try {
      await axios.patch(
        `${APPOINTMENT_URL}/api/appointments/internal/${transaction.appointmentId}/payment-outcome`,
        { outcome: 'FAILED' },
        { headers: internalHeaders() }
      );
    } catch (_) {}

    return {
      success: true,
      status: 'FAILED',
      reconciled: true,
      transaction: updated,
    };
  }

  // Case 3: Still PENDING / OPEN on Stripe
  return {
    success: true,
    status: 'PENDING',
    reconciled: false,
    transaction,
  };
}

/**
 * Periodic scanner for any stuck checkouts (older than 2 minutes).
 * Guarantees zero blocked or abandoned appointments if a webhook was dropped.
 */
async function scanAndReconcileStuckTransactions(minutesCutoff = 2) {
  const cutoff = new Date(Date.now() - minutesCutoff * 60 * 1000);
  const maxAge = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48h limit

  const stuck = await prisma.transaction.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff, gt: maxAge },
      stripeCheckoutSessionId: { not: null },
    },
    take: 20,
    orderBy: { createdAt: 'asc' },
  });

  if (stuck.length === 0) return { reconciledCount: 0 };

  console.log(`[reconcileCron] Found ${stuck.length} pending transactions older than ${minutesCutoff}m. Reconciling...`);

  let reconciledCount = 0;
  for (const txn of stuck) {
    try {
      const res = await reconcileCheckoutSession({
        sessionId: txn.stripeCheckoutSessionId,
        transactionId: txn.id,
      });
      if (res.reconciled) {
        reconciledCount += 1;
        console.log(`[reconcileCron] Transaction ${txn.id} auto-reconciled to ${res.status}`);
      }
    } catch (err) {
      console.error(`[reconcileCron] Error reconciling txn ${txn.id}:`, err.message);
    }
  }

  return { checked: stuck.length, reconciledCount };
}

/**
 * Verifies a single refund against Stripe and updates database if finalized.
 */
async function verifyAndSyncRefund(refund, connectedAccountId) {
  if (!refund || !refund.stripeRefundId) return refund;

  if (['PROCESSED', 'COMPLETED', 'FAILED'].includes(refund.status)) {
    return refund;
  }

  try {
    const accountId = connectedAccountId || refund.transaction?.stripeConnectedAccountId;
    const retrieveOpts = accountId ? { stripeAccount: accountId } : {};
    const stripeRefund = await stripe.refunds.retrieve(refund.stripeRefundId, {}, retrieveOpts);

    if (stripeRefund.status === 'succeeded') {
      const updated = await prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(stripeRefund.created ? stripeRefund.created * 1000 : Date.now()),
          receiptUrl: stripeRefund.receipt_number || refund.receiptUrl || null,
        },
      });
      return updated;
    } else if (stripeRefund.status === 'failed') {
      const updated = await prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: 'FAILED',
          failureReason: stripeRefund.failure_reason || 'Declined by card issuer',
        },
      });
      return updated;
    }
  } catch (err) {
    console.warn(`[verifyAndSyncRefund] Could not verify refund ${refund.id} with Stripe:`, err.message);
  }

  return refund;
}

/**
 * Checks all unfinalized refunds on a transaction against Stripe and updates them.
 */
async function syncRefundsForTransaction(transaction) {
  if (!transaction || !transaction.refunds || transaction.refunds.length === 0) return transaction;

  const updatedRefunds = await Promise.all(
    transaction.refunds.map(async (r) => {
      if (['PROCESSING', 'SUBMITTED_TO_PSP', 'PENDING'].includes(r.status)) {
        return verifyAndSyncRefund(r, transaction.stripeConnectedAccountId);
      }
      return r;
    })
  );

  return { ...transaction, refunds: updatedRefunds };
}

module.exports = {
  reconcileCheckoutSession,
  scanAndReconcileStuckTransactions,
  verifyAndSyncRefund,
  syncRefundsForTransaction,
};
