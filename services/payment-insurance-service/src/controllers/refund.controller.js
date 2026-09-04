'use strict';

const stripe = require('../config/stripeClient');
const prisma = require('../config/prismaClient');
const { rejectIfNotSuperAdmin } = require('../utils/roleGuards');

/**
 * Shared refund logic — used by the admin-facing HTTP endpoint below AND by
 * the automatic reconciliation path in stripeConnect.controller.js's
 * checkout.session.completed handler (see Part B.5). Both paths need the
 * exact same Stripe-call + Refund-row-creation behavior, so this is the one
 * place that does it.
 *
 * Does NOT flip Transaction/Refund status to a final state — that only
 * happens once the charge.refunded webhook confirms it actually happened,
 * same "webhook is the source of truth" principle already used for payment
 * confirmation in 1.4. This function only creates the PENDING Refund row and
 * asks Stripe to start the refund.
 */
async function processRefund({ transactionId, amount, reasonCategory, reason, refundCommission, initiatedBy, initiatedByRole }) {
  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!transaction) {
    const err = new Error(`Transaction ${transactionId} not found.`);
    err.statusCode = 404;
    throw err;
  }
  if (!transaction.stripePaymentIntentId || !transaction.stripeConnectedAccountId) {
    const err = new Error(`Transaction ${transactionId} has no completed Stripe payment to refund.`);
    err.statusCode = 422;
    throw err;
  }
  if (!['SUCCESS', 'PARTIALLY_REFUNDED'].includes(transaction.status)) {
    const err = new Error(`Transaction ${transactionId} is ${transaction.status} — only a SUCCESS or PARTIALLY_REFUNDED transaction can be refunded.`);
    err.statusCode = 422;
    throw err;
  }

  // Never refund more than what's left. Sum both PENDING and PROCESSED so two
  // near-simultaneous refund requests can't together exceed the original charge.
  const alreadyRefunded = await prisma.refund.aggregate({
    where: { transactionId, status: { in: ['PENDING', 'PROCESSED'] } },
    _sum: { amount: true },
  });
  const alreadyRefundedAmount = Number(alreadyRefunded._sum.amount || 0);
  const remaining = Number(transaction.grossAmount) - alreadyRefundedAmount;
  if (amount > remaining) {
    const err = new Error(`Refund amount ${amount} exceeds the remaining refundable amount ${remaining} on this transaction.`);
    err.statusCode = 422;
    throw err;
  }

  const amountMinor = Math.round(amount * 100);

  const stripeRefund = await stripe.refunds.create({
    payment_intent: transaction.stripePaymentIntentId,
    amount: amountMinor,
    reason: 'requested_by_customer',
    metadata: { transactionId, reasonCategory },
  });
  // No { stripeAccount } — this PaymentIntent lives on the platform account.
  // No refund_application_fee — there was never an application fee to reverse;
  // refundCommission below is purely our own ledger flag now, not a Stripe
  // API parameter.

  const commissionAmountRefunded = refundCommission
    ? Math.round((Number(transaction.commissionAmount) * (amount / Number(transaction.grossAmount))) * 100) / 100
    : 0;

  const refundRow = await prisma.refund.create({
    data: {
      transactionId,
      amount,
      reason,
      reasonCategory,
      status: 'PENDING',
      stripeRefundId: stripeRefund.id,
      initiatedBy: initiatedBy || null,
      initiatedByRole: initiatedByRole || null,
      commissionAmountRefunded,
    },
  });

  return { refund: refundRow, stripeRefund };
}

/**
 * POST /api/payments/stripe/refunds
 * SUPER_ADMIN only for now — hospital-admin-initiated refunds need to know
 * which hospital the caller administers, and that mapping isn't available
 * from the gateway's forwarded headers yet (only X-User-ID/X-User-Role are
 * forwarded today). Revisit this once Phase 4 (Hospital Admin integration)
 * wires that up properly, rather than guessing at it here.
 *
 * Body: { transactionId, amount, reasonCategory, reason, refundCommission }
 * refundCommission is required explicitly, not defaulted — whether DoctorNow
 * keeps or returns its commission on a refund is still an open question sent
 * to the client (see DoctorNow_Client_Questions_Payment_Refund_Cancellation.md,
 * question 9), so don't hardcode an assumption here.
 */
async function issueRefund(req, res) {
  // X-Hospital-ID exists at the gateway (see api-gateway/src/http-proxy/http-proxy.service.ts) but its reliability for HOSPITAL_ADMIN accounts is unverified — do not scope access by it until that's confirmed. See 1.7 audit notes.
  if (rejectIfNotSuperAdmin(req, res)) return;

  const { transactionId, amount, reasonCategory, reason, refundCommission } = req.body;
  if (!transactionId || amount == null || !reasonCategory || typeof refundCommission !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'transactionId, amount, reasonCategory, and refundCommission (boolean) are all required.',
    });
  }
  if (Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'amount must be greater than 0.' });
  }

  const { refund } = await processRefund({
    transactionId,
    amount: Number(amount),
    reasonCategory,
    reason: reason || null,
    refundCommission,
    initiatedBy: req.headers['x-user-id'] || null,
    initiatedByRole: req.headers['x-user-role'] || null,
  });

  return res.status(201).json({ success: true, data: refund });
}

module.exports = { issueRefund, processRefund };
