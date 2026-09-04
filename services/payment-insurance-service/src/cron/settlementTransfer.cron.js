/**
 * settlementTransfer.cron.js
 * payment-insurance-service
 *
 * Runs nightly, automatically transferring every hospital's eligible balance —
 * replacing the "Super Admin clicks execute" step with a scheduled batch. The
 * manual endpoint (POST /settlements/:hospitalId/execute) still exists and still
 * works, for one-off or urgent cases, but this is what runs in the normal course
 * of business now.
 *
 * A transaction only becomes eligible once SETTLEMENT_HOLD_HOURS have passed
 * since it was paid (Transaction.paidAt) — deliberately not instant. This gives
 * refunds and early disputes a window to surface while the money is still in
 * DoctorNow's own balance, before it's sent to the hospital and a clawback
 * (transfer reversal / SettlementAdjustment) would be needed instead.
 *
 * Runs at 21:00 UTC — ahead of commissionInvoice.cron's 23:00 UTC slot and
 * appointment-service's 2AM slot-maintenance cron, so none of them hit their
 * databases at the same moment.
 *
 * Safe to run more than once, or alongside a manual settlement call: every
 * transfer is created with a per-transaction idempotency key
 * (settlement-transfer-${txn.id}), and a transaction already marked
 * TRANSFERRED simply won't be picked up again by the eligibility query.
 */
const cron = require('node-cron');
const { runAllPendingSettlements } = require('../controllers/settlement.controller');

cron.schedule('0 21 * * *', async () => {
  console.log('[cron] Running automatic hospital settlement...');
  try {
    const summary = await runAllPendingSettlements();
    console.log(`[cron] Settlement complete: ${summary.transferred} transfer(s) across ${summary.hospitalsProcessed} hospital(s), ${summary.failed} failure(s).`);
  } catch (err) {
    console.error('[cron] Automatic settlement run failed:', err.message);
  }
});

module.exports = {};
