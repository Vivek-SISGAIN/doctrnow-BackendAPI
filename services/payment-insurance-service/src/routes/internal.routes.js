'use strict';

const express = require('express');
const { internalAuth } = require('../middleware/internalAuth');
const { reconcileStuckCheckouts, reconcileStuckRefunds } = require('../jobs/reconcileStuckCheckouts');
const { generateDueCommissionInvoices } = require('../jobs/generateCommissionInvoices');

const router = express.Router();

router.use(internalAuth);

/**
 * POST /internal/reconcile-stuck-checkouts
 * Protected by internalAuth (x-internal-sig header)
 */
router.post('/reconcile-stuck-checkouts', async (req, res, next) => {
  try {
    const result = await reconcileStuckCheckouts();
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /internal/reconcile-stuck-refunds
 * Protected by internalAuth (x-internal-sig header)
 */
router.post('/reconcile-stuck-refunds', async (req, res, next) => {
  try {
    const result = await reconcileStuckRefunds();
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /internal/generate-commission-invoices
 * Protected by internalAuth (x-internal-sig header)
 */
router.post('/generate-commission-invoices', async (req, res, next) => {
  try {
    const result = await generateDueCommissionInvoices();
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
