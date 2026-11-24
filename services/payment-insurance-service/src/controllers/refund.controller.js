'use strict';

const prisma = require('../config/prismaClient');
const { rejectIfNotSuperAdmin, getPagination } = require('../utils/roleGuards');
const { evaluateCancellationRefund, executeRefundWorkflow } = require('../services/refundEngine.service');
const axios = require('axios');

const APPOINTMENT_URL = process.env.APPOINTMENT_SERVICE_URL;

function internalHeaders() {
  const h = {};
  if (process.env.INTERNAL_SERVICE_SECRET) {
    h['x-internal-secret'] = process.env.INTERNAL_SERVICE_SECRET;
  }
  return h;
}

/**
 * GET /api/payments/stripe/refunds/preview
 * Evaluates cancellation & refund eligibility before confirming cancellation or issuing refund.
 * Query: { appointmentId, transactionId, actorRole, reasonCodeOverride }
 */
async function previewCancellationRefund(req, res) {
  const { appointmentId, transactionId, actorRole = 'PATIENT', reasonCodeOverride } = req.query;

  if (!appointmentId && !transactionId) {
    return res.status(400).json({ success: false, message: 'appointmentId or transactionId is required.' });
  }

  const where = appointmentId ? { appointmentId } : { id: transactionId };
  const transaction = await prisma.transaction.findFirst({
    where,
    include: { refunds: true, disputes: true },
  });

  if (!transaction) {
    return res.status(404).json({ success: false, message: 'Transaction not found.' });
  }

  // Fetch appointment slot details if available
  let appointment = {
    id: transaction.appointmentId,
    policySnapshot: transaction.policySnapshot,
  };

  if (APPOINTMENT_URL && transaction.appointmentId) {
    try {
      const apptRes = await axios.get(`${APPOINTMENT_URL}/api/appointments/${transaction.appointmentId}`, {
        headers: {
          ...internalHeaders(),
          'x-user-id': req.headers['x-user-id'] || 'SYSTEM',
          'x-user-role': req.headers['x-user-role'] || 'ADMIN',
        },
        timeout: 4000,
      });
      if (apptRes.data?.data) {
        appointment = apptRes.data.data;
      }
    } catch (err) {
      console.warn('[previewCancellationRefund] Could not fetch live appointment from appointment-service:', err.message);
    }
  }

  const evaluation = evaluateCancellationRefund({
    appointment,
    transaction,
    actorRole,
    requestTime: new Date(),
    reasonCodeOverride,
  });

  return res.status(200).json({
    success: true,
    data: {
      ...evaluation,
      transactionId: transaction.id,
      appointmentId: transaction.appointmentId,
      grossAmount: Number(transaction.grossAmount),
      currency: transaction.currency.toUpperCase(),
      paymentStatus: transaction.status,
    },
  });
}

/**
 * POST /api/payments/stripe/refunds/process-cancellation
 * Internal endpoint called by appointment-service when an appointment is cancelled.
 * Body: { appointmentId, cancelledBy, cancellationReason, slotStartTime }
 */
async function handleAppointmentCancellationRefund(req, res) {
  const { appointmentId, cancelledBy = 'PATIENT', cancellationReason, slotStartTime } = req.body;

  if (!appointmentId) {
    return res.status(400).json({ success: false, message: 'appointmentId is required.' });
  }

  const transaction = await prisma.transaction.findFirst({
    where: { appointmentId },
    include: { refunds: true, disputes: true },
  });

  if (!transaction) {
    // If appointment had no paid transaction, nothing to refund financially
    return res.status(200).json({
      success: true,
      processed: false,
      message: 'No payment transaction found for this appointment.',
    });
  }

  if (!['SUCCESS', 'PARTIALLY_REFUNDED'].includes(transaction.status)) {
    return res.status(200).json({
      success: true,
      processed: false,
      message: `Transaction is in ${transaction.status} status; no refund executed.`,
    });
  }

  const appointment = {
    id: appointmentId,
    slot: { startTime: slotStartTime },
    policySnapshot: transaction.policySnapshot,
  };

  const evaluation = evaluateCancellationRefund({
    appointment,
    transaction,
    actorRole: cancelledBy,
    requestTime: new Date(),
  });

  if (!evaluation.eligible || evaluation.refundableAmount <= 0) {
    // Case like PATIENT_NO_SHOW: record deduction & reason
    return res.status(200).json({
      success: true,
      processed: false,
      outcomeStatus: evaluation.outcomeStatus,
      reasonCategory: evaluation.reasonCategory,
      deductionAmount: evaluation.deductionAmount,
      refundableAmount: 0,
      summaryMessage: evaluation.summaryMessage,
    });
  }

  // Execute the refund workflow
  try {
    const refundResult = await executeRefundWorkflow({
      transactionId: transaction.id,
      appointmentId,
      amount: evaluation.refundableAmount,
      reasonCategory: evaluation.reasonCategory,
      reason: cancellationReason || evaluation.summaryMessage,
      initiatedBy: req.headers['x-user-id'] || 'SYSTEM',
      initiatedByRole: cancelledBy,
      policySnapshot: evaluation.policySnapshot,
      metadata: {
        cancelledBy,
        deductionAmount: evaluation.deductionAmount,
        hoursUntilStart: evaluation.hoursUntilStart,
      },
      autoApprove: evaluation.outcomeStatus === 'APPROVED',
    });

    return res.status(200).json({
      success: true,
      processed: true,
      ...refundResult,
      reasonCategory: evaluation.reasonCategory,
      deductionAmount: evaluation.deductionAmount,
      refundableAmount: evaluation.refundableAmount,
      summaryMessage: evaluation.summaryMessage,
    });
  } catch (err) {
    console.error('[handleAppointmentCancellationRefund] Refund execution error:', err.message);
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.message,
    });
  }
}

/**
 * POST /api/payments/stripe/refunds
 * Initiates an administrative refund (SUPER_ADMIN or authorized support).
 * Body: { transactionId, amount, reasonCategory, reason, refundCommission, autoApprove }
 */
async function issueRefund(req, res) {
  if (rejectIfNotSuperAdmin(req, res)) return;

  const {
    transactionId,
    amount,
    reasonCategory,
    reason,
    autoApprove = true,
  } = req.body;

  if (!transactionId || amount == null || !reasonCategory) {
    return res.status(400).json({
      success: false,
      message: 'transactionId, amount, and reasonCategory are required.',
    });
  }

  if (Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'amount must be greater than 0.' });
  }

  try {
    const result = await executeRefundWorkflow({
      transactionId,
      amount: Number(amount),
      reasonCategory,
      reason: reason || null,
      initiatedBy: req.headers['x-user-id'] || null,
      initiatedByRole: req.headers['x-user-role'] || 'SUPER_ADMIN',
      autoApprove: autoApprove !== false,
    });

    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/payments/stripe/refunds
 * Lists all refunds with FOS 9-stage statuses, SLA tracking, and filters.
 */
async function listRefunds(req, res) {
  const { status, reasonCategory, search, hospitalId, page, limit } = req.query;
  const { skip, take, page: p, limit: l } = getPagination(req, 10, 50);

  const where = {};
  if (status && status !== 'ALL') {
    where.status = status;
  }
  if (reasonCategory && reasonCategory !== 'ALL') {
    where.reasonCategory = reasonCategory;
  }
  if (hospitalId) {
    where.transaction = { hospitalId };
  }

  if (search) {
    where.OR = [
      { id: { contains: search, mode: 'insensitive' } },
      { transactionId: { contains: search, mode: 'insensitive' } },
      { stripeRefundId: { contains: search, mode: 'insensitive' } },
      { reason: { contains: search, mode: 'insensitive' } },
      { transaction: { patientName: { contains: search, mode: 'insensitive' } } },
      { transaction: { doctorName: { contains: search, mode: 'insensitive' } } },
      { transaction: { hospitalName: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [refunds, totalCount] = await Promise.all([
    prisma.refund.findMany({
      where,
      include: {
        transaction: {
          select: {
            id: true,
            appointmentId: true,
            patientId: true,
            patientName: true,
            patientEmail: true,
            doctorId: true,
            doctorName: true,
            hospitalId: true,
            hospitalName: true,
            grossAmount: true,
            currency: true,
            status: true,
            paymentFlow: true,
            stripeConnectedAccountId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.refund.count({ where }),
  ]);

  const formatted = refunds.map((r) => ({
    id: r.id,
    transactionId: r.transactionId,
    amount: Number(r.amount),
    currency: r.transaction?.currency?.toUpperCase() || 'AED',
    status: r.status,
    reasonCategory: r.reasonCategory,
    reason: r.reason,
    stripeRefundId: r.stripeRefundId,
    receiptUrl: r.receiptUrl,
    failureReason: r.failureReason,
    initiatedBy: r.initiatedBy,
    initiatedByRole: r.initiatedByRole,
    decidedBy: r.decidedBy,
    decidedAt: r.decidedAt,
    decisionReason: r.decisionReason,
    slaDueAt: r.slaDueAt,
    isSlaBreached: r.slaDueAt ? new Date(r.slaDueAt) < new Date() && !['COMPLETED', 'REJECTED', 'PROCESSED'].includes(r.status) : false,
    policySnapshot: r.policySnapshot,
    commissionAmountRefunded: Number(r.commissionAmountRefunded || 0),
    processedAt: r.processedAt,
    createdAt: r.createdAt,
    patientName: r.transaction?.patientName || 'Patient',
    patientEmail: r.transaction?.patientEmail || '—',
    doctorName: r.transaction?.doctorName || 'Doctor',
    hospitalName: r.transaction?.hospitalName || 'Hospital',
    appointmentId: r.transaction?.appointmentId,
    paymentFlow: r.transaction?.paymentFlow || 'CHECKOUT_URL',
  }));

  return res.status(200).json({
    success: true,
    data: {
      refunds: formatted,
      pagination: {
        page: p,
        limit: l,
        total: totalCount,
        pages: Math.ceil(totalCount / l),
      },
    },
  });
}

/**
 * PATCH /api/payments/stripe/refunds/:id/decision
 * For manual review cases (UNDER_REVIEW): Admin approves or rejects the refund.
 * Body: { decision: 'APPROVE' | 'REJECT', decisionReason, customAmount }
 */
async function decideRefund(req, res) {
  if (rejectIfNotSuperAdmin(req, res)) return;

  const { id } = req.params;
  const { decision, decisionReason, customAmount } = req.body;

  if (!['APPROVE', 'REJECT'].includes(decision)) {
    return res.status(400).json({ success: false, message: 'decision must be APPROVE or REJECT.' });
  }

  const refund = await prisma.refund.findUnique({
    where: { id },
    include: { transaction: true },
  });

  if (!refund) {
    return res.status(404).json({ success: false, message: `Refund ${id} not found.` });
  }

  if (refund.status !== 'UNDER_REVIEW') {
    return res.status(400).json({
      success: false,
      message: `Refund ${id} is in status ${refund.status}; only UNDER_REVIEW cases can be decided.`,
    });
  }

  const adminId = req.headers['x-user-id'] || 'ADMIN';

  if (decision === 'REJECT') {
    const updated = await prisma.refund.update({
      where: { id },
      data: {
        status: 'REJECTED',
        decidedBy: adminId,
        decidedAt: new Date(),
        decisionReason: decisionReason || 'Rejected during administrative review',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Refund request rejected.',
      data: updated,
    });
  }

  // If APPROVED, execute against Stripe Direct Charge
  const targetAmount = customAmount != null ? Number(customAmount) : Number(refund.amount);

  try {
    const result = await executeRefundWorkflow({
      transactionId: refund.transactionId,
      appointmentId: refund.transaction.appointmentId,
      amount: targetAmount,
      reasonCategory: refund.reasonCategory,
      reason: decisionReason || refund.reason,
      initiatedBy: adminId,
      initiatedByRole: 'SUPER_ADMIN',
      policySnapshot: refund.policySnapshot,
      autoApprove: true,
    });

    // Mark original review row as approved/superseded
    await prisma.refund.update({
      where: { id },
      data: {
        status: 'APPROVED',
        decidedBy: adminId,
        decidedAt: new Date(),
        decisionReason: decisionReason || 'Approved by administrator',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Refund approved and submitted to payment provider.',
      data: result,
    });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
}

module.exports = {
  issueRefund,
  previewCancellationRefund,
  handleAppointmentCancellationRefund,
  listRefunds,
  decideRefund,
};
