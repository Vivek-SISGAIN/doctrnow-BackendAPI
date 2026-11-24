/**
 * paymentReconciliation.cron.js
 * payment-insurance-service
 *
 * Runs every 2 minutes to scan for pending checkouts older than 2 minutes.
 * Ensures that if a Stripe webhook is dropped, delayed, or encounters network
 * issues, the transaction and appointment are automatically reconciled against
 * Stripe without blocking patients, doctors, or hospitals.
 */
'use strict';

const cron = require('node-cron');
const { scanAndReconcileStuckTransactions } = require('../services/reconciliation.service');
const { reconcileStuckRefunds } = require('../jobs/reconcileStuckCheckouts');

cron.schedule('*/2 * * * *', async () => {
  try {
    const result = await scanAndReconcileStuckTransactions(2);
    if (result.reconciledCount > 0) {
      console.log(`[cron:reconcile] Reconciled ${result.reconciledCount} transactions successfully.`);
    }
  } catch (err) {
    console.error('[cron:reconcile] Stuck transactions scan failed:', err.message);
  }

  try {
    const refundRes = await reconcileStuckRefunds();
    if (refundRes.reconciledCount > 0) {
      console.log(`[cron:reconcile] Reconciled ${refundRes.reconciledCount} refunds with Stripe successfully.`);
    }
  } catch (err) {
    console.error('[cron:reconcile] Stuck refunds scan failed:', err.message);
  }
});

module.exports = {};
