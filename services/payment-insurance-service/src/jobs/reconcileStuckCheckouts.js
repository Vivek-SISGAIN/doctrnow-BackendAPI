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
 * Refunds can legitimately take longer than a checkout session (especially
 * for non-card methods), so this uses a longer cutoff than the checkout
 * reconciliation above. Same principle: ask Stripe directly rather than
 * assuming a missing webhook means a missing refund.
 */
async function reconcileStuckRefunds() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h
  const stuck = await prisma.refund.findMany({
    where: { status: 'PENDING', createdAt: { lt: cutoff } },
    include: { transaction: true },
  });

  for (const refund of stuck) {
    if (!refund.stripeRefundId) continue;
    try {
      const stripeRefund = await stripe.refunds.retrieve(
        refund.stripeRefundId,
        { stripeAccount: refund.transaction.stripeConnectedAccountId }
      );
      if (stripeRefund.status === 'succeeded') {
        await prisma.refund.update({ where: { id: refund.id }, data: { status: 'PROCESSED', processedAt: new Date() } });
        console.log(`[reconcile] Refund ${refund.id} confirmed as PROCESSED`);
      } else if (stripeRefund.status === 'failed') {
        await prisma.refund.update({ where: { id: refund.id }, data: { status: 'FAILED' } });
        console.error(`[reconcile] Refund ${refund.id} FAILED on Stripe's side — needs manual handling.`);
      }
      // status 'pending' on Stripe's side: leave as-is, check again next run.
    } catch (err) {
      console.error(`[reconcile] Failed to reconcile refund ${refund.id}:`, err?.response?.data || err.message);
    }
  }

  return { checked: stuck.length };
}

module.exports = { reconcileStuckCheckouts, reconcileStuckRefunds };
