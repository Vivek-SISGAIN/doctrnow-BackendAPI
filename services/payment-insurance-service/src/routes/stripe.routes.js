'use strict';

const express = require('express');
const {
  createConnectedAccount,
  createOnboardingLink,
  createOwnOnboardingLink,
  syncStripeStatus,
  handleWebhook,
  handleConnectWebhook,
} = require('../controllers/stripeConnect.controller');
const { createCheckoutSession, createPaymentIntent } = require('../controllers/checkout.controller');
const { issueRefund } = require('../controllers/refund.controller');
const {
  getHospitalLedger,
  getHospitalsCommissionLedger,
  getHospitalInvoices,
  getInvoiceById,
  updateInvoiceStatus,
  submitInvoicePayment,
  acknowledgeInvoicePayment,
  generateInvoiceManual,
  getPlatformSummary,
  listRefunds,
  listDisputes,
  listAllInvoices,
} = require('../controllers/ledger.controller');
const {
  listPendingSettlements,
  executeSettlement,
  listSettlementAdjustments,
} = require('../controllers/settlement.controller');

const {
  listPatientTransactions,
  getPatientTransactionById,
  listPatientRefunds,
} = require('../controllers/patientPayment.controller');

const {
  listHospitalTransactions,
  getHospitalTransactionById,
  getHospitalStats,
  listHospitalRefunds,
} = require('../controllers/hospitalPayment.controller');

const {
  listAdminTransactions,
  getAdminTransactionById,
  getAdminStats,
  listAdminRefunds,
  getAdminDashboardAnalytics,
} = require('../controllers/adminPayment.controller');

const { reconcileCheckoutSession } = require('../services/reconciliation.service');

const router = express.Router();

// ─── Fallback Session Verification APIs (Bypasses Webhook Latency / Failures) ─
async function verifySessionHandler(req, res) {
  const sessionId = req.params.sessionId || req.body?.sessionId || req.query?.sessionId;
  const paymentIntentId = req.params.paymentIntentId || req.body?.paymentIntentId || req.query?.paymentIntentId;
  const appointmentId = req.params.appointmentId || req.body?.appointmentId || req.query?.appointmentId;
  const transactionId = req.params.transactionId || req.body?.transactionId || req.query?.transactionId;

  const result = await reconcileCheckoutSession({ sessionId, paymentIntentId, appointmentId, transactionId });
  const statusCode = result.success ? 200 : 404;
  return res.status(statusCode).json(result);
}

router.all('/checkout-sessions/:sessionId/verify', express.json(), asyncHandler(verifySessionHandler));
router.all('/payment-intents/:paymentIntentId/verify', express.json(), asyncHandler(verifySessionHandler));
router.all('/payment-intents/verify', express.json(), asyncHandler(verifySessionHandler));
router.all('/verify-appointment/:appointmentId', express.json(), asyncHandler(verifySessionHandler));
router.all('/verify-session', express.json(), asyncHandler(verifySessionHandler));

/**
 * POST /api/payments/stripe/webhook
 * Platform / Account Webhook endpoint (verified with STRIPE_WEBHOOK_SECRET,
 * falls back to STRIPE_CONNECT_WEBHOOK_SECRET).
 * MUST receive raw Buffer bytes.
 */
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(handleWebhook)
);

/**
 * POST /api/payments/stripe/connect-webhook
 * Connected Accounts Webhook endpoint (verified with STRIPE_CONNECT_WEBHOOK_SECRET,
 * falls back to STRIPE_WEBHOOK_SECRET).
 * MUST receive raw Buffer bytes.
 */
router.post(
  '/connect-webhook',
  express.raw({ type: 'application/json' }),
  asyncHandler(handleConnectWebhook)
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
 * POST /api/payments/stripe/accounts/onboarding-link
 * Requires x-user-role: HOSPITAL_ADMIN — hospitalId comes only from
 * x-tenant-id, never from the request. This is the hospital's own
 * self-service onboarding action; SUPER_ADMIN keeps the :hospitalId route
 * above unchanged for account creation follow-up if that ever fails.
 */
router.post('/accounts/onboarding-link', asyncHandler(createOwnOnboardingLink));

/**
 * GET /api/payments/stripe/sync-status
 * HOSPITAL_ADMIN / SUPER_ADMIN — fetches live Stripe account data and
 * syncs it to the DB. Use when webhook delivery cannot be guaranteed
 * (e.g. local dev, or after manually enabling an account in Stripe dashboard).
 */
router.get('/sync-status', asyncHandler(syncStripeStatus));

/**
 * POST /api/payments/stripe/checkout-sessions
 * Body: { doctorId, hospitalId, slotId, consultationType, familyMemberId, reason, notes }
 * Requires x-user-id and x-user-role: PATIENT
 */
router.post('/checkout-sessions', express.json(), asyncHandler(createCheckoutSession));

/**
 * POST /api/payments/stripe/payment-intents
 * Body: { doctorId, hospitalId, slotId, consultationType, familyMemberId, reason, notes }
 * Requires x-user-id and x-user-role: PATIENT
 * Creates PaymentIntent on hospital connected account for Mobile Native PaymentSheet
 */
router.post('/payment-intents', express.json(), asyncHandler(createPaymentIntent));

/**
 * POST /api/payments/stripe/refunds
 * Body: { transactionId, amount, reasonCategory, reason, refundCommission }
 * Requires x-user-role: SUPER_ADMIN
 */
router.post('/refunds', express.json(), asyncHandler(issueRefund));

router.get('/hospitals/:hospitalId/ledger', express.json(), asyncHandler(getHospitalLedger));
router.get('/hospitals/:hospitalId/invoices', express.json(), asyncHandler(getHospitalInvoices));
router.post('/invoices/generate', express.json(), asyncHandler(generateInvoiceManual));
router.get('/invoices', express.json(), asyncHandler(listAllInvoices));
router.get('/invoices/:invoiceId', express.json(), asyncHandler(getInvoiceById));
router.patch('/invoices/:invoiceId/status', express.json(), asyncHandler(updateInvoiceStatus));
router.post('/invoices/:invoiceId/submit-payment', express.json(), asyncHandler(submitInvoicePayment));
router.post('/invoices/:invoiceId/acknowledge-payment', express.json(), asyncHandler(acknowledgeInvoicePayment));
router.get('/ledger/summary', express.json(), asyncHandler(getPlatformSummary));
router.get('/ledger/hospitals', express.json(), asyncHandler(getHospitalsCommissionLedger));
router.get('/refunds', express.json(), asyncHandler(listRefunds));
router.get('/disputes', express.json(), asyncHandler(listDisputes));

router.get('/settlements/pending', express.json(), asyncHandler(listPendingSettlements));
router.get('/settlements/adjustments', express.json(), asyncHandler(listSettlementAdjustments));
router.post('/settlements/:hospitalId/execute', express.json(), asyncHandler(executeSettlement));

// ─── Patient Payment APIs ──────────────────────────────────────────────────
router.get('/patient/transactions', express.json(), asyncHandler(listPatientTransactions));
router.get('/patient/transactions/:id', express.json(), asyncHandler(getPatientTransactionById));
router.get('/patient/refunds', express.json(), asyncHandler(listPatientRefunds));

// ─── Hospital Admin Payment APIs ───────────────────────────────────────────
router.get('/hospital/transactions', express.json(), asyncHandler(listHospitalTransactions));
router.get('/hospital/transactions/:id', express.json(), asyncHandler(getHospitalTransactionById));
router.get('/hospital/stats', express.json(), asyncHandler(getHospitalStats));
router.get('/hospital/refunds', express.json(), asyncHandler(listHospitalRefunds));

// ─── Super Admin Payment APIs ──────────────────────────────────────────────
router.get('/admin/analytics/dashboard', express.json(), asyncHandler(getAdminDashboardAnalytics));
router.get('/admin/transactions', express.json(), asyncHandler(listAdminTransactions));
router.get('/admin/transactions/:id', express.json(), asyncHandler(getAdminTransactionById));
router.get('/admin/stats', express.json(), asyncHandler(getAdminStats));
router.get('/admin/refunds', express.json(), asyncHandler(listAdminRefunds));

// ─── Minimal inline asyncHandler (keeps this service dependency-free) ─────────
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = router;
