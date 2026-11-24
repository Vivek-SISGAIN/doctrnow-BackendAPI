'use strict';

const stripe = require('../config/stripeClient');
const prisma = require('../config/prismaClient');
const axios = require('axios');

/**
 * Finds Transactions still PENDING more than 40 minutes after creation
 * (Checkout Sessions expire at 30 min — this gives a 10-minute buffer for
 * normal webhook delivery) and asks Stripe directly what actually happened,
 * rather than trusting that a webhook arrived.
 */
async function reconcileStuckCheckouts() {
  const cutoff = new Date(Date.now() - 40 * 60 * 1000);
  const stuck = await prisma.transaction.findMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff } },
  });

  for (const txn of stuck) {
    if (!txn.stripeCheckoutSessionId) continue;
    try {
      const session = await stripe.checkout.sessions.retrieve(
        txn.stripeCheckoutSessionId,
        { stripeAccount: txn.stripeConnectedAccountId }
      );
      const outcome = session.payment_status === 'paid' ? 'PAID' : 'FAILED';

      await prisma.transaction.update({
        where: { id: txn.id },
        data: { status: outcome === 'PAID' ? 'SUCCESS' : 'FAILED' },
      });

      await axios.patch(
        `${process.env.APPOINTMENT_SERVICE_URL}/api/appointments/internal/${txn.appointmentId}/payment-outcome`,
        { outcome },
        { headers: { 'x-internal-sig': process.env.INTERNAL_SERVICE_SECRET } }
      );
      console.log(`[reconcile] Transaction ${txn.id} resolved as ${outcome}`);
    } catch (err) {
      console.error(`[reconcile] Failed to reconcile transaction ${txn.id}:`, err?.response?.data || err.message);
    }
  }

  return { checked: stuck.length };
}

/**
 * Verifies any pending or processing refunds against Stripe.
 * Queries Stripe directly to confirm whether the refund has succeeded or failed,
 * ensuring database state stays completely in sync even if webhooks are delayed or offline.
 */
async function reconcileStuckRefunds() {
  const stuck = await prisma.refund.findMany({
    where: { status: { in: ['PENDING', 'PROCESSING', 'SUBMITTED_TO_PSP'] } },
    include: { transaction: true },
    take: 50,
    orderBy: { createdAt: 'desc' },
  });

  let reconciledCount = 0;

  for (const refund of stuck) {
    if (!refund.stripeRefundId) continue;
    try {
      const retrieveOpts = refund.transaction?.stripeConnectedAccountId
        ? { stripeAccount: refund.transaction.stripeConnectedAccountId }
        : {};
      // Pass empty params object as 2nd arg and options as 3rd arg per Stripe Node SDK
      const stripeRefund = await stripe.refunds.retrieve(
        refund.stripeRefundId,
        {},
        retrieveOpts
      );
      if (stripeRefund.status === 'succeeded') {
        await prisma.refund.update({
          where: { id: refund.id },
          data: {
            status: 'PROCESSED',
            processedAt: new Date((stripeRefund.created ? stripeRefund.created * 1000 : Date.now())),
            receiptUrl: stripeRefund.receipt_number || refund.receiptUrl || null,
          },
        });
        reconciledCount++;
        console.log(`[reconcile] Refund ${refund.id} verified with Stripe as PROCESSED`);
      } else if (stripeRefund.status === 'failed') {
        await prisma.refund.update({
          where: { id: refund.id },
          data: {
            status: 'FAILED',
            failureReason: stripeRefund.failure_reason || 'Declined by card issuer',
          },
        });
        reconciledCount++;
        console.error(`[reconcile] Refund ${refund.id} marked FAILED based on Stripe verification.`);
      }
    } catch (err) {
      console.error(`[reconcile] Failed to reconcile refund ${refund.id}:`, err?.message);
    }
  }

  return { checked: stuck.length, reconciledCount };
}

module.exports = { reconcileStuckCheckouts, reconcileStuckRefunds };
