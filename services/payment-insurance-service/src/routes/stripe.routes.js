'use strict';

const express = require('express');
const {
  createConnectedAccount,
  createOnboardingLink,
  handleWebhook,
} = require('../controllers/stripeConnect.controller');
const { createCheckoutSession } = require('../controllers/checkout.controller');
const { issueRefund } = require('../controllers/refund.controller');
const {
  getHospitalLedger,
  getHospitalInvoices,
  getInvoiceById,
  updateInvoiceStatus,
  getPlatformSummary,
} = require('../controllers/ledger.controller');

const router = express.Router();

/**
 * POST /api/payments/stripe/webhook
 *
 * MUST be defined before any express.json() body-parser touches this path.
 * The route uses express.raw() so that req.body is a raw Buffer — Stripe
 * signature verification (stripe.webhooks.constructEvent) requires the exact
 * raw bytes as received from Stripe; JSON.parse + re-stringify changes the
 * byte sequence and breaks the HMAC check.
 *
 * In app.js this router is mounted BEFORE the global express.json() call, OR
 * the webhook path is excluded from the global parser. See app.js for details.
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(handleWebhook)
);

/**
 * POST /api/payments/stripe/accounts
 * Body: { hospitalId }
 * Requires x-user-role: SUPER_ADMIN
 *
 * This router is mounted before global express.json() in app.js (required so
 * the webhook route receives a raw body). POST /accounts reads req.body, so it
 * carries its own inline express.json() here.
 * POST /accounts/:hospitalId/onboarding-link only reads req.params and needs
 * no body parser — do not add one there.
 */
router.post('/accounts', express.json(), asyncHandler(createConnectedAccount));

/**
 * POST /api/payments/stripe/accounts/:hospitalId/onboarding-link
 * Requires x-user-role: SUPER_ADMIN
 */
router.post('/accounts/:hospitalId/onboarding-link', asyncHandler(createOnboardingLink));

/**
 * POST /api/payments/stripe/checkout-sessions
 * Body: { doctorId, hospitalId, slotId, consultationType, familyMemberId, reason, notes }
 * Requires x-user-id and x-user-role: PATIENT
 */
router.post('/checkout-sessions', express.json(), asyncHandler(createCheckoutSession));

/**
 * POST /api/payments/stripe/refunds
 * Body: { transactionId, amount, reasonCategory, reason, refundCommission }
 * Requires x-user-role: SUPER_ADMIN
 */
router.post('/refunds', express.json(), asyncHandler(issueRefund));

router.get('/hospitals/:hospitalId/ledger', express.json(), asyncHandler(getHospitalLedger));
router.get('/hospitals/:hospitalId/invoices', express.json(), asyncHandler(getHospitalInvoices));
router.get('/invoices/:invoiceId', express.json(), asyncHandler(getInvoiceById));
router.patch('/invoices/:invoiceId/status', express.json(), asyncHandler(updateInvoiceStatus));
router.get('/ledger/summary', express.json(), asyncHandler(getPlatformSummary));

// ─── Minimal inline asyncHandler (keeps this service dependency-free) ─────────
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = router;
