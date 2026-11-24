'use strict';

const stripe = require('../config/stripeClient');
const prisma = require('../config/prismaClient');
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
 * Evaluates refund & cancellation eligibility based on the FOS HealthTech Framework (20 Sep 2026).
 * Computes deterministic refund/deduction or routes to review.
 */
function evaluateCancellationRefund({
  appointment,
  transaction,
  actorRole = 'PATIENT',
  requestTime = new Date(),
  reasonCodeOverride = null,
}) {
  const grossAmount = Number(transaction.grossAmount || 0);

  // 1. Calculate already refunded amount to protect against duplicate or excessive refunds (Section 12.5)
  const existingRefunds = transaction.refunds || [];
  const alreadyRefunded = existingRefunds
    .filter((r) => ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'SUBMITTED_TO_PSP', 'PROCESSING', 'COMPLETED', 'PENDING', 'PROCESSED'].includes(r.status))
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const remainingRefundable = Math.max(0, grossAmount - alreadyRefunded);

  if (remainingRefundable <= 0) {
    return {
      eligible: false,
      reasonCategory: 'REFUND_FAILED',
      deductionAmount: 0,
      refundableAmount: 0,
      refundPercent: 0,
      outcomeStatus: 'REJECTED',
      summaryMessage: 'This transaction has already been fully refunded.',
      remainingRefundable: 0,
      policySnapshot: null,
    };
  }

  // 2. Check for active chargebacks/disputes (Section 5, CHARGEBACK_OPEN)
  const hasOpenDispute = (transaction.disputes || []).some((d) => ['NEEDS_RESPONSE', 'UNDER_REVIEW'].includes(d.status));
  if (hasOpenDispute) {
    return {
      eligible: false,
      reasonCategory: 'CHARGEBACK_OPEN',
      deductionAmount: grossAmount,
      refundableAmount: 0,
      refundPercent: 0,
      outcomeStatus: 'UNDER_REVIEW',
      summaryMessage: 'Active payment dispute / chargeback opened with card network. Automated refund blocked to prevent duplicate loss.',
      remainingRefundable,
      policySnapshot: null,
    };
  }

  // 3. Resolve Policy Snapshot (Bucket 2 - snapshotted at checkout)
  const policy = appointment.policySnapshot || transaction.policySnapshot || {
    policyVersion: '1.0.0-DEFAULT',
    freeCancellationHours: 4,
    lateCancellationFeePercent: 50,
    nearTimeNoShowHours: 1,
    patientGraceMinutes: 10,
    doctorGraceMinutes: 10,
    displayedSummary: 'Default policy: Free cancellation up to 4 hours before slot. 50% deduction inside 4 hours. No refunds within 1 hour.',
  };

  const normalizedRole = String(actorRole || '').toUpperCase();

  // 4. If explicit override reason supplied (e.g. by Admin or System)
  if (reasonCodeOverride) {
    if (['PLATFORM_TECH_FAILURE', 'PROVIDER_TECH_FAILURE', 'DUPLICATE_CHARGE', 'ORPHAN_PAYMENT_BOOKING_FAILED', 'PROVIDER_CANCEL', 'PROVIDER_NO_SHOW'].includes(reasonCodeOverride)) {
      return {
        eligible: true,
        reasonCategory: reasonCodeOverride,
        deductionAmount: 0,
        refundableAmount: remainingRefundable,
        refundPercent: 100,
        outcomeStatus: 'APPROVED',
        summaryMessage: `Mandatory 100% full refund approved under reason: ${reasonCodeOverride}.`,
        remainingRefundable,
        policySnapshot: policy,
      };
    }
    if (['CONSULT_STARTED_PROVIDER_FAILURE', 'PATIENT_TECH_FAILURE'].includes(reasonCodeOverride)) {
      return {
        eligible: true,
        reasonCategory: reasonCodeOverride,
        deductionAmount: 0,
        refundableAmount: remainingRefundable,
        refundPercent: 100,
        outcomeStatus: 'UNDER_REVIEW',
        summaryMessage: `Request submitted under reason: ${reasonCodeOverride}. Routed to review for evidence evaluation.`,
        remainingRefundable,
        policySnapshot: policy,
      };
    }
    if (reasonCodeOverride === 'CONSULT_COMPLETED') {
      return {
        eligible: false,
        reasonCategory: 'CONSULT_COMPLETED',
        deductionAmount: grossAmount,
        refundableAmount: 0,
        refundPercent: 0,
        outcomeStatus: 'REJECTED',
        summaryMessage: 'Consultation completed. Non-refundable solely for dissatisfaction with clinical advice.',
        remainingRefundable,
        policySnapshot: policy,
      };
    }
  }

  // 5. Provider / Doctor Cancellation (Bucket 1: 100% Mandatory Remedy)
  if (normalizedRole === 'DOCTOR' || normalizedRole === 'PROVIDER') {
    return {
      eligible: true,
      reasonCategory: 'PROVIDER_CANCEL',
      deductionAmount: 0,
      refundableAmount: remainingRefundable,
      refundPercent: 100,
      outcomeStatus: 'APPROVED',
      summaryMessage: 'Provider cancelled consultation. 100% full refund issued to original payment method.',
      remainingRefundable,
      policySnapshot: policy,
    };
  }

  // 6. Patient Cancellation Logic (Time-based against slot startTime in UAE GST)
  const slotStart = new Date(appointment.slot?.startTime || appointment.slotTime || appointment.startTime);
  const now = new Date(requestTime);
  const hoursUntilStart = (slotStart.getTime() - now.getTime()) / (1000 * 60 * 60);

  const freeHours = Number(policy.freeCancellationHours ?? 4);
  const latePercent = Number(policy.lateCancellationFeePercent ?? 50);
  const noShowHours = Number(policy.nearTimeNoShowHours ?? 1);

  // Scenario A: Within Free Cancellation Window (>= freeCancellationHours)
  if (hoursUntilStart >= freeHours) {
    return {
      eligible: true,
      reasonCategory: 'PATIENT_CANCEL_FREE_WINDOW',
      deductionAmount: 0,
      refundableAmount: remainingRefundable,
      refundPercent: 100,
      outcomeStatus: 'APPROVED',
      summaryMessage: `Cancelled ${hoursUntilStart.toFixed(1)} hours before appointment (free window is ${freeHours}h). 100% full refund of AED ${remainingRefundable.toFixed(2)}.`,
      remainingRefundable,
      policySnapshot: policy,
    };
  }

  // Scenario B: Late Cancellation (between nearTimeNoShowHours and freeCancellationHours)
  if (hoursUntilStart < freeHours && hoursUntilStart >= noShowHours) {
    const rawDeduction = Math.round(grossAmount * (latePercent / 100) * 100) / 100;
    const rawRefund = Math.max(0, grossAmount - rawDeduction);
    const finalRefund = Math.min(remainingRefundable, rawRefund);

    return {
      eligible: true,
      reasonCategory: 'PATIENT_LATE_CANCEL',
      deductionAmount: rawDeduction,
      refundableAmount: finalRefund,
      refundPercent: 100 - latePercent,
      outcomeStatus: 'APPROVED',
      summaryMessage: `Late cancellation (${hoursUntilStart.toFixed(1)}h before appointment). ${latePercent}% deduction (AED ${rawDeduction.toFixed(2)}) applied per hospital policy. Refundable: AED ${finalRefund.toFixed(2)}.`,
      remainingRefundable,
      policySnapshot: policy,
    };
  }

  // Scenario C: Near-Time Cancellation / No-Show (< nearTimeNoShowHours or already started)
  return {
    eligible: false,
    reasonCategory: 'PATIENT_NO_SHOW',
    deductionAmount: grossAmount,
    refundableAmount: 0,
    refundPercent: 0,
    outcomeStatus: 'REJECTED',
    summaryMessage: `Cancellation within near-time window (< ${noShowHours}h before appointment). Treated under provider no-show rule as non-refundable.`,
    remainingRefundable,
    policySnapshot: policy,
  };
}

/**
 * Executes a full or partial refund adhering to the 9-stage auditable FOS workflow.
 */
async function executeRefundWorkflow({
  transactionId,
  appointmentId,
  amount,
  reasonCategory,
  reason,
  initiatedBy,
  initiatedByRole = 'SYSTEM',
  policySnapshot = null,
  metadata = {},
  autoApprove = true,
}) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { refunds: true, disputes: true },
  });

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

  const existingRefunds = transaction.refunds || [];
  const alreadyRefunded = existingRefunds
    .filter((r) => ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'SUBMITTED_TO_PSP', 'PROCESSING', 'COMPLETED', 'PENDING', 'PROCESSED'].includes(r.status))
    .reduce((sum, r) => sum + Number(r.amount), 0);

  const remaining = Math.max(0, Number(transaction.grossAmount) - alreadyRefunded);
  const targetAmount = Math.min(Number(amount), remaining);

  if (targetAmount <= 0) {
    const err = new Error(`No remaining refundable balance on transaction ${transactionId}.`);
    err.statusCode = 422;
    throw err;
  }

  const effectivePolicy = policySnapshot || transaction.policySnapshot || null;

  // SLA Target calculation: within 1-3 business days per FOS Section 4
  const slaDueAt = new Date();
  slaDueAt.setDate(slaDueAt.getDate() + 3);

  // If case requires manual review, create in UNDER_REVIEW state without Stripe submission
  if (!autoApprove) {
    const reviewRefund = await prisma.refund.create({
      data: {
        transactionId,
        amount: targetAmount,
        reason: reason || 'Refund request submitted for review',
        reasonCategory,
        status: 'UNDER_REVIEW',
        slaDueAt,
        initiatedBy: initiatedBy || null,
        initiatedByRole,
        policySnapshot: effectivePolicy,
        metadata,
      },
    });

    return {
      status: 'UNDER_REVIEW',
      refund: reviewRefund,
      message: 'Refund case submitted for administrative review.',
    };
  }

  // 1. Create Refund in SUBMITTED_TO_PSP
  const initialRefund = await prisma.refund.create({
    data: {
      transactionId,
      amount: targetAmount,
      reason: reason || `Automated refund under ${reasonCategory}`,
      reasonCategory,
      status: 'SUBMITTED_TO_PSP',
      slaDueAt,
      initiatedBy: initiatedBy || null,
      initiatedByRole,
      policySnapshot: effectivePolicy,
      metadata,
    },
  });

  let stripeRefund;
  try {
    // 2. Call Stripe Direct Charge Refund on Hospital's Connected Account
    stripeRefund = await stripe.refunds.create(
      {
        payment_intent: transaction.stripePaymentIntentId,
        amount: Math.round(targetAmount * 100),
        reason: 'requested_by_customer',
        metadata: {
          transactionId,
          appointmentId: appointmentId || transaction.appointmentId,
          refundId: initialRefund.id,
          reasonCategory,
          policyVersion: effectivePolicy?.policyVersion || '1.0.0-DEFAULT',
        },
      },
      {
        stripeAccount: transaction.stripeConnectedAccountId,
      }
    );
  } catch (stripeErr) {
    console.error(`[refundEngine] Stripe refund failed for transaction ${transactionId}:`, stripeErr.message);
    await prisma.refund.update({
      where: { id: initialRefund.id },
      data: {
        status: 'FAILED',
        failureReason: stripeErr.message,
      },
    });
    const err = new Error(`Payment provider refund failed: ${stripeErr.message}`);
    err.statusCode = 502;
    throw err;
  }

  // 3. Update Refund status based directly on Stripe's response
  // If Stripe completed the refund immediately (standard for card refunds), mark as PROCESSED.
  // Otherwise if pending network clearance, mark as PROCESSING.
  const isSucceeded = stripeRefund && stripeRefund.status === 'succeeded';
  const refundStatus = isSucceeded
    ? 'PROCESSED'
    : (stripeRefund && stripeRefund.status === 'failed' ? 'FAILED' : 'PROCESSING');

  // Compute commission amount reversed for DoctorNow monthly billing ledger
  const gross = Number(transaction.grossAmount);
  const comm = Number(transaction.commissionAmount || 0);
  const commissionReversed = gross > 0 ? Math.round((comm * (targetAmount / gross)) * 100) / 100 : 0;

  const updatedRefund = await prisma.refund.update({
    where: { id: initialRefund.id },
    data: {
      status: refundStatus,
      stripeRefundId: stripeRefund.id,
      receiptUrl: stripeRefund.receipt_number || null,
      commissionAmountRefunded: commissionReversed,
      decidedBy: initiatedBy || 'SYSTEM',
      decidedAt: new Date(),
      decisionReason: reason || reasonCategory,
      ...(isSucceeded ? { processedAt: new Date() } : {}),
    },
  });

  // 4. Update transaction status to REFUNDED or PARTIALLY_REFUNDED
  const newAlreadyRefunded = alreadyRefunded + targetAmount;
  const newTxStatus = newAlreadyRefunded >= gross ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { status: newTxStatus },
  });

  // 5. Update appointment payment status via appointment-service internal endpoint
  const targetApptId = appointmentId || transaction.appointmentId;
  if (targetApptId && APPOINTMENT_URL) {
    try {
      await axios.patch(
        `${APPOINTMENT_URL}/api/appointments/internal/${targetApptId}/payment-outcome`,
        { outcome: newTxStatus },
        { headers: internalHeaders(), timeout: 5000 }
      );
    } catch (apptErr) {
      console.warn(`[refundEngine] Could not update appointment ${targetApptId} payment status:`, apptErr.message);
    }
  }

  return {
    status: 'PROCESSING',
    refund: updatedRefund,
    stripeRefund,
    transactionStatus: newTxStatus,
    amountRefunded: targetAmount,
  };
}

module.exports = {
  evaluateCancellationRefund,
  executeRefundWorkflow,
};
