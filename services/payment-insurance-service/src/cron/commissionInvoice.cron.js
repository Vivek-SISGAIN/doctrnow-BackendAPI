/**
 * commissionInvoice.cron.js
 * payment-insurance-service
 *
 * Runs nightly at 3AM UAE time (23:00 UTC) — one hour after
 * appointment-service's own 2AM slot-maintenance cron, so they don't hit
 * their databases at the same moment.
 *
 * Idempotent and safe to run more than once a day or to miss a run entirely:
 * generateDueCommissionInvoices() only creates an invoice once a hospital's
 * billing cycle has actually elapsed, and every transaction it bills is
 * marked (commissionInvoiceId) inside the same DB transaction as the
 * invoice row, so nothing can ever be billed twice.
 */
const cron = require('node-cron');
const { generateDueCommissionInvoices } = require('../jobs/generateCommissionInvoices');

cron.schedule('0 23 * * *', async () => {
  console.log('[cron] Running commission invoice generation...');
  try {
    const result = await generateDueCommissionInvoices();
    console.log(`[cron] Commission invoicing complete: ${result.invoicesGenerated} invoice(s) generated across ${result.hospitalsChecked} hospital(s) checked.`);
  } catch (err) {
    console.error('[cron] Commission invoice generation failed:', err.message);
  }
});

module.exports = {};
