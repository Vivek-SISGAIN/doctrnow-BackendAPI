'use strict';

const stripe = require('../config/stripeClient');
const prisma = require('../config/prismaClient');
const { rejectIfNotSuperAdmin, resolveReadScope } = require('../utils/roleGuards');

const HOLD_HOURS = Number(process.env.SETTLEMENT_HOLD_HOURS) || 48;

/**
 * GET /api/payments/stripe/settlements/pending
 * SUPER_ADMIN only.
 * Returns transactions that are fully paid, not refunded at all (or partially
 * refunded with a positive net remainder), haven't been transferred yet, and
 * have cleared the SETTLEMENT_HOLD_HOURS hold period — grouped by hospital.
 */
async function listPendingSettlements(req, res) {
  const scope = resolveReadScope(req, res);
  if (!scope) return;

  const cutoff = new Date(Date.now() - HOLD_HOURS * 60 * 60 * 1000);
  const eligible = await prisma.transaction.findMany({
    where: {
      ...(scope.hospitalId && { hospitalId: scope.hospitalId }),
      status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED'] },
      transferStatus: 'NOT_TRANSFERRED',
      paidAt: { not: null, lte: cutoff },
    },
    select: { id: true, hospitalId: true, hospitalNetAmount: true, createdAt: true },
  });

  const byHospital = {};
  for (const t of eligible) {
    if (!byHospital[t.hospitalId]) {
      byHospital[t.hospitalId] = { hospitalId: t.hospitalId, transactionCount: 0, totalDue: 0, oldestTransactionAt: t.createdAt };
    }
    byHospital[t.hospitalId].transactionCount += 1;
    byHospital[t.hospitalId].totalDue += Number(t.hospitalNetAmount);
    if (t.createdAt < byHospital[t.hospitalId].oldestTransactionAt) {
      byHospital[t.hospitalId].oldestTransactionAt = t.createdAt;
    }
  }

  return res.status(200).json({ success: true, data: Object.values(byHospital) });
}

/**
 * Core settlement execution logic for a single hospital.
 * Returns a plain result object { transferred, failed, message?, error? }.
 */
async function runSettlementForHospital(hospitalId) {
  const cutoff = new Date(Date.now() - HOLD_HOURS * 60 * 60 * 1000);

  const eligible = await prisma.transaction.findMany({
    where: {
      hospitalId,
      status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED'] },
      transferStatus: 'NOT_TRANSFERRED',
      paidAt: { not: null, lte: cutoff },
    },
  });

  if (eligible.length === 0) {
    return { transferred: [], failed: [], message: 'Nothing pending for this hospital.' };
  }

  const stripeAccountId = eligible[0].stripeConnectedAccountId;
  if (!stripeAccountId) {
    return { transferred: [], failed: [], error: `Hospital ${hospitalId} has no connected Stripe account.` };
  }

  // Pull any open recovery shortfalls for this hospital and net them off
  // this batch, oldest first, before transferring anything. Adjustments are
  // drained one at a time (not pooled) so a partially-covered adjustment
  // stays OPEN for the remainder instead of being written off — see 1.12.
  const openAdjustments = await prisma.settlementAdjustment.findMany({
    where: { hospitalId, status: 'OPEN' },
    orderBy: { createdAt: 'asc' },
  });
  const adjustmentBalancesMinor = openAdjustments.map((a) => Math.round(Number(a.amount) * 100));
  let adjustmentIndex = 0;
  const fullyAppliedIds = [];

  const transferred = [];
  const failed = [];

  for (const txn of eligible) {
    let amountMinor = Math.round(Number(txn.hospitalNetAmount) * 100);

    while (amountMinor > 0 && adjustmentIndex < openAdjustments.length) {
      const applied = Math.min(adjustmentBalancesMinor[adjustmentIndex], amountMinor);
      amountMinor -= applied;
      adjustmentBalancesMinor[adjustmentIndex] -= applied;
      if (adjustmentBalancesMinor[adjustmentIndex] === 0) {
        fullyAppliedIds.push(openAdjustments[adjustmentIndex].id);
        adjustmentIndex += 1;
      }
    }

    if (amountMinor <= 0) {
      // Fully absorbed by an adjustment — nothing to transfer, but still
      // mark it TRANSFERRED so it doesn't sit in the eligible set forever.
      await prisma.transaction.update({ where: { id: txn.id }, data: { transferStatus: 'TRANSFERRED', transferredAt: new Date() } });
      transferred.push({ transactionId: txn.id, stripeTransferId: null, amount: 0, note: 'Fully absorbed by an open adjustment.' });
      continue;
    }

    try {
      const transfer = await stripe.transfers.create(
        { amount: amountMinor, currency: txn.currency, destination: stripeAccountId, transfer_group: txn.appointmentId, metadata: { transactionId: txn.id, hospitalId } },
        { idempotencyKey: `settlement-transfer-${txn.id}` }
      );
      await prisma.transaction.update({ where: { id: txn.id }, data: { transferStatus: 'TRANSFERRED', stripeTransferId: transfer.id, transferredAt: new Date() } });
      transferred.push({ transactionId: txn.id, stripeTransferId: transfer.id, amount: amountMinor / 100 });
    } catch (err) {
      console.error(`[settlement] Transfer failed for transaction ${txn.id}:`, err.message);
      await prisma.transaction.update({ where: { id: txn.id }, data: { transferStatus: 'FAILED' } });
      failed.push({ transactionId: txn.id, error: err.message });
    }
  }

  if (fullyAppliedIds.length > 0) {
    await prisma.settlementAdjustment.updateMany({
      where: { id: { in: fullyAppliedIds } },
      data: { status: 'APPLIED' },
    });
  }

  // At most one adjustment can be left partially drained — the one
  // adjustmentIndex is still pointing at when the loop ran out of eligible
  // transactions. Everything before it was fully applied (handled above);
  // everything after it wasn't touched at all. Write its balance down to
  // what's actually still outstanding so it's accurate next time, but leave
  // it OPEN — it hasn't been recovered yet.
  if (adjustmentIndex < openAdjustments.length) {
    const partial = openAdjustments[adjustmentIndex];
    const originalMinor = Math.round(Number(partial.amount) * 100);
    const remainingMinor = adjustmentBalancesMinor[adjustmentIndex];
    if (remainingMinor < originalMinor) {
      await prisma.settlementAdjustment.update({
        where: { id: partial.id },
        data: { amount: remainingMinor / 100 },
      });
    }
  }

  return { transferred, failed };
}

/**
 * POST /api/payments/stripe/settlements/:hospitalId/execute
 * SUPER_ADMIN only.
 * Manual trigger to transfer eligible funds for a single hospital.
 */
async function executeSettlement(req, res) {
  // X-Hospital-ID exists at the gateway (see api-gateway/src/http-proxy/http-proxy.service.ts) but its reliability for HOSPITAL_ADMIN accounts is unverified — do not scope access by it until that's confirmed. See 1.7 audit notes.
  if (rejectIfNotSuperAdmin(req, res)) return;
  const { hospitalId } = req.params;

  const result = await runSettlementForHospital(hospitalId);
  if (result.error) {
    return res.status(422).json({ success: false, message: result.error });
  }
  return res.status(200).json({ success: true, message: result.message, data: { transferred: result.transferred, failed: result.failed } });
}

/**
 * Runs settlements across all hospitals that have eligible transactions past the hold period.
 */
async function runAllPendingSettlements() {
  const cutoff = new Date(Date.now() - HOLD_HOURS * 60 * 60 * 1000);

  const hospitals = await prisma.transaction.findMany({
    where: {
      status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED'] },
      transferStatus: 'NOT_TRANSFERRED',
      paidAt: { not: null, lte: cutoff },
    },
    select: { hospitalId: true },
    distinct: ['hospitalId'],
  });

  const summary = { hospitalsProcessed: 0, transferred: 0, failed: 0 };

  for (const { hospitalId } of hospitals) {
    try {
      const result = await runSettlementForHospital(hospitalId);
      summary.hospitalsProcessed += 1;
      summary.transferred += result.transferred.length;
      summary.failed += result.failed.length;
      if (result.error) {
        console.error(`[settlement] Auto-settlement skipped for hospital ${hospitalId}: ${result.error}`);
      }
    } catch (err) {
      // One hospital's batch throwing must not stop the rest from running.
      console.error(`[settlement] Auto-settlement threw for hospital ${hospitalId}:`, err.message);
    }
  }

  return summary;
}

/**
 * Attempts to recover `amountMinor` from a hospital whose transfer has
 * already gone out. First choice: reverse part of the original Transfer —
 * this only works if the hospital's connected-account balance still has
 * the funds (i.e. Stripe hasn't paid them out to their bank yet). If that
 * fails, record an open SettlementAdjustment so the shortfall is netted
 * off the hospital's next settlement batch automatically, instead of
 * requiring a human to remember to chase it.
 */
async function recoverFromHospital({ transaction, amountMinor, reason }) {
  try {
    const reversal = await stripe.transfers.createReversal(
      transaction.stripeTransferId,
      { amount: amountMinor },
      { idempotencyKey: `reversal-${transaction.id}-${amountMinor}` }
    );
    await prisma.settlementAdjustment.create({
      data: {
        hospitalId: transaction.hospitalId,
        transactionId: transaction.id,
        amount: amountMinor / 100,
        reason,
        status: 'RECOVERED_VIA_REVERSAL',
        stripeTransferReversalId: reversal.id,
      },
    });
    console.log(`[settlement] Recovered ${amountMinor / 100} from hospital ${transaction.hospitalId} via transfer reversal for transaction ${transaction.id}.`);
  } catch (err) {
    // Reversal failed — most likely the hospital's connected-account
    // balance no longer holds the funds (already paid out to their bank).
    // Don't treat this as an error to retry blindly; record it as an open
    // adjustment so it comes out of their next settlement automatically.
    console.error(`[settlement] Transfer reversal failed for transaction ${transaction.id} (hospital ${transaction.hospitalId}) — flagging for next settlement instead:`, err.message);
    await prisma.settlementAdjustment.create({
      data: {
        hospitalId: transaction.hospitalId,
        transactionId: transaction.id,
        amount: amountMinor / 100,
        reason,
        status: 'OPEN',
      },
    });
  }
}

/**
 * GET /api/payments/stripe/settlements/adjustments?status=OPEN&hospitalId=...
 * Read-only audit trail — nothing here is actioned from this endpoint.
 * OPEN adjustments get swept up automatically by executeSettlement/
 * runAllPendingSettlements the next time that hospital has a batch; this is
 * purely visibility into that process, not a trigger for it.
 */
async function listSettlementAdjustments(req, res) {
  const scope = resolveReadScope(req, res);
  if (!scope) return;
  const { status, hospitalId } = req.query;

  const where = {};
  if (status) where.status = status;
  if (scope.hospitalId) {
    // HOSPITAL_ADMIN — always their own hospital, the query param is ignored.
    where.hospitalId = scope.hospitalId;
  } else if (hospitalId) {
    // SUPER_ADMIN — free to filter by any hospital, or omit for all.
    where.hospitalId = hospitalId;
  }

  const adjustments = await prisma.settlementAdjustment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return res.status(200).json({ success: true, data: adjustments });
}

module.exports = { listPendingSettlements, executeSettlement, runSettlementForHospital, runAllPendingSettlements, recoverFromHospital, listSettlementAdjustments };

