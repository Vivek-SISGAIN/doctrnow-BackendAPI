'use strict';

const axios = require('axios');
const stripe = require('../config/stripeClient');
const prisma = require('../config/prismaClient');
const { rejectIfNotSuperAdmin } = require('../utils/roleGuards');
const { processRefund } = require('./refund.controller');
const { recoverFromHospital } = require('./settlement.controller');
const { reconcileCheckoutSession } = require('../services/reconciliation.service');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build the shared Axios config for internal calls to super-admin-service.
 * The x-internal-sig header must match what super-admin's internalAuth.js checks.
 */
function superAdminHeaders() {
  return {
    'x-internal-sig': process.env.INTERNAL_SERVICE_SECRET,
    'Content-Type': 'application/json',
  };
}

function superAdminBase() {
  const base = process.env.SUPER_ADMIN_SERVICE_URL;
  if (!base) throw new Error('SUPER_ADMIN_SERVICE_URL is not configured');
  return base;
}

/**
 * Creates a connected account on Stripe using Accounts v2 (POST /v2/core/accounts)
 * configured with Merchant capabilities for UAE direct charges, with v1 fallback.
 */
async function provisionStripeConnectedAccount({ hospitalId, name, email }) {
  // Full required parameter set for Accounts v2 merchant config (verified against live Stripe API).
  // dashboard, defaults.responsibilities, and contact_email are ALL required when
  // configuration.merchant is set.
  if (!email) {
    throw new Error('Hospital contact email is required to create a Stripe connected account.');
  }
  const account = await stripe.v2.core.accounts.create({
    display_name: name || 'Hospital',
    contact_email: email,
    identity: { country: 'AE' },
    dashboard: 'full',
    defaults: {
      responsibilities: {
        losses_collector: 'stripe',
        fees_collector: 'stripe',
      },
    },
    configuration: {
      merchant: {
        card_payments: {},
      },
    },
  });
  console.log(`[stripeConnect] Created Stripe Accounts v2 merchant account ${account.id} for hospital ${hospitalId}`);
  return account;
}

/**
 * Creates an onboarding link for a connected account using Accounts v2.
 *
 * Handles legacy accounts (created before v2 migration) that have no applied
 * configurations by auto-upgrading them to the merchant config before link creation.
 * For new accounts this is a no-op since they are created with the merchant config.
 */
async function provisionStripeOnboardingLink({ stripeAccountId, email, refreshUrl, returnUrl }) {
  // 1. Fetch the account to read its actual applied_configurations
  const existingAccount = await stripe.v2.core.accounts.retrieve(stripeAccountId);
  let configs = existingAccount.applied_configurations || [];

  // 2. If this is a legacy account with no configurations, upgrade it to merchant
  if (configs.length === 0) {
    console.log(`[stripeConnect] Account ${stripeAccountId} has no configurations — upgrading to merchant config.`);
    if (!existingAccount.contact_email && !email) {
      throw new Error('A contact email is required to upgrade this Stripe account to merchant configuration.');
    }
    const updatePayload = {
      dashboard: 'full',
      defaults: {
        responsibilities: {
          losses_collector: 'stripe',
          fees_collector: 'stripe',
        },
      },
      configuration: {
        merchant: { card_payments: {} },
      },
    };
    if (!existingAccount.contact_email && email) {
      updatePayload.contact_email = email;
    }
    const updated = await stripe.v2.core.accounts.update(stripeAccountId, updatePayload);
    configs = updated.applied_configurations || ['merchant'];
    console.log(`[stripeConnect] Upgraded account ${stripeAccountId} to configs: ${configs}`);
  }

  // 3. Create the onboarding link using the account's actual configurations
  const v2Link = await stripe.v2.core.accountLinks.create({
    account: stripeAccountId,
    use_case: {
      type: 'account_onboarding',
      account_onboarding: {
        configurations: configs, // Always matches applied_configurations on the account
        refresh_url: refreshUrl,
        return_url: returnUrl,
      },
    },
  });
  return {
    url: v2Link.url,
    expiresAt: v2Link.expires_at
      ? Math.floor(new Date(v2Link.expires_at).getTime() / 1000)
      : null,
  };
}

// ─── POST /api/payments/stripe/accounts ───────────────────────────────────────

/**
 * Creates a Stripe connected account for a hospital.
 *
 * 1. Validates caller is SUPER_ADMIN (via x-user-role header set by the gateway).
 * 2. Creates a Stripe account (country AE, merchant direct charges).
 * 3. Calls super-admin-service's internal PATCH endpoint to store the account id.
 * 4. Returns the Stripe account id to the caller.
 */
async function createConnectedAccount(req, res) {
  if (rejectIfNotSuperAdmin(req, res)) return;

  const { hospitalId } = req.body;
  if (!hospitalId) {
    return res.status(400).json({ success: false, message: '`hospitalId` is required.' });
  }

  // Reject if this hospital already has a connected account — creating a
  // second one would orphan the first and silently overwrite the reference
  // to it. Re-onboarding an existing account goes through the
  // onboarding-link endpoint instead, not this one.
  let existingHospital;
  try {
    const r = await axios.get(`${superAdminBase()}/api/super-admins/hospital/${hospitalId}`, {
      headers: superAdminHeaders(),
    });
    existingHospital = r.data?.data || r.data;
  } catch (err) {
    if (err?.response?.status === 404) {
      return res.status(404).json({ success: false, message: `Hospital ${hospitalId} not found.` });
    }
    console.error('[stripe/createConnectedAccount] Failed to fetch hospital:', err?.response?.data || err.message);
    return res.status(502).json({ success: false, message: 'Could not fetch hospital details.' });
  }
  if (existingHospital?.stripeAccountId) {
    return res.status(409).json({
      success: false,
      message: `Hospital ${hospitalId} already has a connected Stripe account (${existingHospital.stripeAccountId}). Use POST /accounts/:hospitalId/onboarding-link to continue onboarding it instead of creating a new one.`,
    });
  }

  // Create the connected account on Stripe using Accounts v2 (or v1 fallback)
  let account;
  try {
    account = await provisionStripeConnectedAccount({
      hospitalId,
      name: existingHospital.officialName || existingHospital.name,
      email: existingHospital.officialEmail || existingHospital.contactEmail || existingHospital.email,
    });
  } catch (createErr) {
    console.error(`[stripe/createConnectedAccount] Failed to create Stripe account for hospital ${hospitalId}:`, createErr.message);
    return res.status(502).json({
      success: false,
      message: `Failed to initialize Stripe account: ${createErr.message}`,
    });
  }

  // Persist the account id and set status to PENDING in super-admin-service
  try {
    await axios.patch(
      `${superAdminBase()}/internal/hospital/${hospitalId}/stripe-status`,
      { stripeAccountId: account.id, stripeOnboardingStatus: 'PENDING' },
      { headers: superAdminHeaders() }
    );
  } catch (superAdminErr) {
    console.error(
      `[stripe/createConnectedAccount] Failed to update super-admin-service for ` +
      `hospitalId=${hospitalId}, stripeAccountId=${account.id}:`,
      superAdminErr?.response?.data || superAdminErr.message
    );
    return res.status(502).json({
      success: false,
      message:
        'Stripe account created but failed to persist to hospital record. ' +
        `stripeAccountId=${account.id}. Manual update required.`,
      stripeAccountId: account.id,
    });
  }

  return res.status(201).json({
    success: true,
    message: 'Stripe connected account created.',
    data: { stripeAccountId: account.id, hospitalId },
  });
}

// ─── POST /api/payments/stripe/accounts/:hospitalId/onboarding-link ───────────

// Shared by both entry points below. Takes an already-resolved hospitalId —
// callers are responsible for deciding *how* that id was resolved (from a
// trusted path param for SUPER_ADMIN, or from x-tenant-id for HOSPITAL_ADMIN)
// before calling this.
async function generateOnboardingLinkForHospital(hospitalId, res) {
  let hospital;
  try {
    const response = await axios.get(
      `${superAdminBase()}/api/super-admins/hospital/${hospitalId}`,
      { headers: superAdminHeaders() }
    );
    hospital = response.data?.data || response.data;
  } catch (err) {
    if (err?.response?.status === 404) {
      return res.status(404).json({ success: false, message: `Hospital ${hospitalId} not found.` });
    }
    console.error('[stripe/onboardingLink] Failed to fetch hospital:', err?.response?.data || err.message);
    return res.status(502).json({ success: false, message: 'Could not fetch hospital from super-admin-service.' });
  }

  let stripeAccountId = hospital?.stripeAccountId;

  // Helper: returns true when a Stripe error means the account no longer exists
  // (deleted from the Stripe Dashboard or test-mode cleanup).
  function isAccountGone(err) {
    return (
      err?.statusCode === 404 ||
      err?.code === 'account_invalid' ||
      /no such account/i.test(err?.message || '')
    );
  }

  // Helper: creates a fresh Stripe connected account and saves its ID to the DB.
  async function provisionFreshAccount() {
    console.log(`[stripe/onboardingLink] Provisioning fresh Stripe account for hospital ${hospitalId}...`);
    const account = await provisionStripeConnectedAccount({
      hospitalId,
      name: hospital.officialName || hospital.name,
      email: hospital.officialEmail || hospital.contactEmail || hospital.email,
    });
    await axios.patch(
      `${superAdminBase()}/internal/hospital/${hospitalId}/stripe-status`,
      { stripeAccountId: account.id, stripeOnboardingStatus: 'PENDING' },
      { headers: superAdminHeaders() }
    );
    console.log(`[stripe/onboardingLink] Fresh Stripe account created: ${account.id}`);
    return account.id;
  }

  if (!stripeAccountId) {
    // Case 1 — hospital has never been onboarded: create from scratch.
    try {
      stripeAccountId = await provisionFreshAccount();
    } catch (createErr) {
      console.error(`[stripe/onboardingLink] Failed to create Stripe account for hospital ${hospitalId}:`, createErr.message);
      return res.status(502).json({
        success: false,
        message: `Failed to initialize Stripe account: ${createErr.message}`,
      });
    }
  }

  const refreshUrl = process.env.STRIPE_CONNECT_ONBOARDING_REFRESH_URL;
  const returnUrl = process.env.STRIPE_CONNECT_ONBOARDING_RETURN_URL;
  if (!refreshUrl || !returnUrl) {
    return res.status(500).json({
      success: false,
      message: 'STRIPE_CONNECT_ONBOARDING_REFRESH_URL / RETURN_URL not configured.',
    });
  }

  try {
    const linkData = await provisionStripeOnboardingLink({
      stripeAccountId,
      email: hospital?.officialEmail || hospital?.contactEmail || hospital?.email,
      refreshUrl,
      returnUrl,
    });

    return res.status(200).json({
      success: true,
      data: linkData,
    });
  } catch (linkErr) {
    // Case 2 — the stripeAccountId in our DB points to a Stripe account that was
    // deleted (e.g. manually removed from the Stripe Dashboard). Detect this,
    // clear the stale ID, create a fresh account, and retry once.
    if (isAccountGone(linkErr)) {
      console.warn(
        `[stripe/onboardingLink] Stripe account ${stripeAccountId} no longer exists. ` +
        `Resetting hospital record and creating a fresh account...`
      );
      try {
        stripeAccountId = await provisionFreshAccount();
        const linkData = await provisionStripeOnboardingLink({
          stripeAccountId,
          email: hospital?.officialEmail || hospital?.contactEmail || hospital?.email,
          refreshUrl,
          returnUrl,
        });
        return res.status(200).json({ success: true, data: linkData });
      } catch (retryErr) {
        console.error(`[stripe/onboardingLink] Retry after reset also failed:`, retryErr.message);
        return res.status(502).json({
          success: false,
          message: `Failed to re-initialize Stripe account: ${retryErr.message}`,
        });
      }
    }

    console.error(`[stripe/onboardingLink] Failed to create onboarding link for account ${stripeAccountId}:`, linkErr.message);
    return res.status(502).json({
      success: false,
      message: `Failed to create Stripe onboarding link: ${linkErr.message}`,
    });
  }
}

// ─── POST /api/payments/stripe/accounts/:hospitalId/onboarding-link ───────────
// SUPER_ADMIN only — DoctorNow staff generating a link for any hospital by
// ID. Behavior unchanged from before this refactor.
async function createOnboardingLink(req, res) {
  if (rejectIfNotSuperAdmin(req, res)) return;
  const { hospitalId } = req.params;
  return generateOnboardingLinkForHospital(hospitalId, res);
}

// ─── POST /api/payments/stripe/accounts/onboarding-link ───────────────────────
// HOSPITAL_ADMIN only — a hospital generating a link for its own onboarding.
// hospitalId is deliberately never taken from the request body, params, or
// query — only from x-tenant-id, the header the gateway sets from the
// caller's own JWT (the same pattern resolveReadScope in roleGuards.js
// already uses elsewhere in this service) — so a HOSPITAL_ADMIN can never
// request a link for a different hospital by passing a different id
// anywhere in the request.
async function createOwnOnboardingLink(req, res) {
  const role = req.headers['x-user-role'];
  if (role !== 'HOSPITAL_ADMIN') {
    return res.status(403).json({
      success: false,
      message: `Forbidden: role '${role || '(none)'}' is not authorised for this endpoint. Requires HOSPITAL_ADMIN.`,
    });
  }
  const hospitalId = req.headers['x-tenant-id'];
  if (!hospitalId) {
    return res.status(403).json({ success: false, message: 'Forbidden: HOSPITAL_ADMIN request is missing X-Tenant-ID.' });
  }
  return generateOnboardingLinkForHospital(hospitalId, res);
}

// ─── POST /api/payments/stripe/webhook & /connect-webhook ──────────────────────

/**
 * Verifies a Stripe signature attempting primarySecret first, then fallbackSecret.
 * This guarantees zero dropped events whether Stripe sends platform events
 * or connected account events to /webhook, /connect-webhook, or a combined URL.
 */
function verifyStripeEvent(rawBody, sig, primarySecret, fallbackSecret) {
  const secrets = Array.from(new Set([primarySecret, fallbackSecret].filter(Boolean)));
  if (secrets.length === 0) {
    throw new Error('No webhook secrets configured for verification.');
  }

  let lastError = null;
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(rawBody, sig, secret);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

/**
 * Shared webhook processing pipeline for both Platform and Connect endpoints.
 */
async function processIncomingWebhook(req, res, primarySecret, fallbackSecret, endpointName = 'webhook') {
  const sig = req.headers['stripe-signature'];
  if (!sig) {
    console.warn(`[stripe/${endpointName}] Missing stripe-signature header.`);
    return res.status(400).send('Webhook Error: Missing stripe-signature header');
  }

  let event;
  try {
    event = verifyStripeEvent(req.body, sig, primarySecret, fallbackSecret);
  } catch (err) {
    console.warn(`[stripe/${endpointName}] Signature verification failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ── Idempotency check ──
  const existing = await prisma.processedWebhookEvent.findUnique({
    where: { id: event.id },
  });
  if (existing) {
    console.log(`[stripe/${endpointName}] Duplicate event ignored: ${event.id} (${event.type})`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  // ── Dispatch ──
  const connectedAccountId = event.account || null;

  switch (event.type) {
    case 'account.updated':
      await handleAccountUpdated(event);
      break;

    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object, connectedAccountId);
      break;

    case 'checkout.session.expired':
      await handleCheckoutExpired(event.data.object, connectedAccountId);
      break;

    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object, connectedAccountId);
      break;

    case 'payment_intent.payment_failed':
      await handlePaymentIntentFailed(event.data.object, connectedAccountId);
      break;

    case 'charge.refunded':
      await handleChargeRefunded(event.data.object, connectedAccountId);
      break;

    case 'charge.dispute.created':
      await handleDisputeCreated(event.data.object, connectedAccountId);
      break;

    case 'charge.dispute.closed':
      await handleDisputeClosed(event.data.object, connectedAccountId);
      break;

    default:
      console.log(`[stripe/${endpointName}] Unhandled event type '${event.type}' (id=${event.id}) — acknowledged.`);
      break;
  }

  // ── Mark as processed ──
  await prisma.processedWebhookEvent.create({
    data: {
      id: event.id,
      type: event.type,
      payload: event.data.object,
    },
  });

  return res.status(200).json({ received: true });
}

/**
 * Platform Account Webhook Handler.
 * Primary: STRIPE_WEBHOOK_SECRET
 * Fallback: STRIPE_CONNECT_WEBHOOK_SECRET
 */
async function handleWebhook(req, res) {
  const primarySecret = process.env.STRIPE_WEBHOOK_SECRET;
  const fallbackSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  return processIncomingWebhook(req, res, primarySecret, fallbackSecret, 'account-webhook');
}

/**
 * Connected Accounts Webhook Handler (Direct Charges on Standard accounts).
 * Primary: STRIPE_CONNECT_WEBHOOK_SECRET
 * Fallback: STRIPE_WEBHOOK_SECRET
 */
async function handleConnectWebhook(req, res) {
  const primarySecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
  const fallbackSecret = process.env.STRIPE_WEBHOOK_SECRET;
  return processIncomingWebhook(req, res, primarySecret, fallbackSecret, 'connect-webhook');
}

// ─── account.updated handler ──────────────────────────────────────────────────

async function handleAccountUpdated(event) {
  const account = event.data.object;
  const stripeAccountId = account.id;

  const chargesEnabled = account.charges_enabled ?? false;
  const payoutsEnabled = account.payouts_enabled ?? false;
  const disabledReason = account.requirements?.disabled_reason;

  // Compute onboarding status:
  // COMPLETE  → both charges and payouts are enabled
  // RESTRICTED → Stripe has set a disabled_reason on the account
  // PENDING   → still working through onboarding steps
  let stripeOnboardingStatus;
  if (chargesEnabled && payoutsEnabled) {
    stripeOnboardingStatus = 'COMPLETE';
  } else if (disabledReason) {
    stripeOnboardingStatus = 'RESTRICTED';
  } else {
    stripeOnboardingStatus = 'PENDING';
  }

  console.log(
    `[stripe/webhook] account.updated → stripeAccountId=${stripeAccountId} ` +
    `status=${stripeOnboardingStatus} charges=${chargesEnabled} payouts=${payoutsEnabled}`
  );

  try {
    await axios.patch(
      `${superAdminBase()}/internal/hospital/by-stripe-account/${stripeAccountId}/stripe-status`,
      {
        stripeOnboardingStatus,
        stripeChargesEnabled: chargesEnabled,
        stripePayoutsEnabled: payoutsEnabled,
      },
      { headers: superAdminHeaders() }
    );
  } catch (err) {
    console.error(
      `[stripe/webhook] account.updated (event.id=${event.id}): ` +
      `Failed to update super-admin-service for stripeAccountId=${stripeAccountId}:`,
      err?.response?.data || err.message
    );
  }
}

// ─── checkout.session.completed handler ──────────────────────────────────────

async function handleCheckoutCompleted(session, eventAccount = null) {
  const appointmentId = session.metadata?.appointmentId;
  if (!appointmentId) {
    console.warn('[webhook] checkout.session.completed with no appointmentId in metadata:', session.id);
  }

  // Idempotently reconcile the checkout session with Stripe
  try {
    const res = await reconcileCheckoutSession({
      sessionId: session.id,
      appointmentId,
    });

    if (res.alreadyReconciled) {
      console.log(`[webhook] Session ${session.id} was already reconciled. Acknowledged.`);
    } else if (res.success) {
      console.log(`[webhook] Session ${session.id} reconciled successfully as ${res.status}`);
    } else {
      console.warn(`[webhook] Session ${session.id} reconciliation returned:`, res.message);
    }
  } catch (err) {
    console.error(`[webhook] Failed to reconcile checkout session ${session.id}:`, err.message);
  }
}

// ─── checkout.session.expired handler ────────────────────────────────────────

async function handleCheckoutExpired(session, eventAccount = null) {
  const appointmentId = session.metadata?.appointmentId;
  if (!appointmentId) return;

  await prisma.transaction.updateMany({
    where: { stripeCheckoutSessionId: session.id, status: 'PENDING' },
    data: { status: 'FAILED' },
  });

  try {
    await axios.patch(
      `${process.env.APPOINTMENT_SERVICE_URL}/api/appointments/internal/${appointmentId}/payment-outcome`,
      { outcome: 'FAILED' },
      { headers: { 'x-internal-sig': process.env.INTERNAL_SERVICE_SECRET } }
    );
  } catch (err) {
    console.error(`[webhook] Failed to release appointment ${appointmentId} after expired checkout:`, err?.response?.data || err.message);
  }
}

// ─── payment_intent.succeeded handler (In-App / Mobile App flow) ──────────────

async function handlePaymentIntentSucceeded(paymentIntent, eventAccount = null) {
  const appointmentId = paymentIntent.metadata?.appointmentId;
  const paymentIntentId = paymentIntent.id;

  try {
    const res = await reconcileCheckoutSession({
      paymentIntentId,
      appointmentId,
    });

    if (res.alreadyReconciled) {
      console.log(`[webhook] PaymentIntent ${paymentIntentId} was already reconciled. Acknowledged.`);
    } else if (res.success) {
      console.log(`[webhook] PaymentIntent ${paymentIntentId} reconciled successfully as ${res.status}`);
    } else {
      console.warn(`[webhook] PaymentIntent ${paymentIntentId} reconciliation returned:`, res.message);
    }
  } catch (err) {
    console.error(`[webhook] Failed to reconcile PaymentIntent ${paymentIntentId}:`, err.message);
  }
}

// ─── payment_intent.payment_failed handler ───────────────────────────────────

async function handlePaymentIntentFailed(paymentIntent, eventAccount = null) {
  const appointmentId = paymentIntent.metadata?.appointmentId;
  const paymentIntentId = paymentIntent.id;

  await prisma.transaction.updateMany({
    where: { stripePaymentIntentId: paymentIntentId, status: 'PENDING' },
    data: { status: 'FAILED' },
  });

  if (appointmentId) {
    try {
      await axios.patch(
        `${process.env.APPOINTMENT_SERVICE_URL}/api/appointments/internal/${appointmentId}/payment-outcome`,
        { outcome: 'FAILED' },
        { headers: { 'x-internal-sig': process.env.INTERNAL_SERVICE_SECRET } }
      );
      console.log(`[webhook] Released appointment ${appointmentId} after failed PaymentIntent ${paymentIntentId}`);
    } catch (err) {
      console.error(`[webhook] Failed to release appointment ${appointmentId} after failed PaymentIntent:`, err?.response?.data || err.message);
    }
  }
}

// ─── charge.refunded handler ──────────────────────────────────────────────────
// Fires once per refund on a charge (and again if a second partial refund
// happens on the same charge later). charge.amount_refunded is the
// CUMULATIVE amount refunded on this charge so far, not just this event's delta.
async function handleChargeRefunded(charge) {
  const transaction = await prisma.transaction.findUnique({
    where: { stripePaymentIntentId: typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id },
  });
  if (!transaction) {
    console.error('[webhook] charge.refunded for unknown payment_intent:', charge.payment_intent);
    return;
  }

  const pendingRefund = await prisma.refund.findFirst({
    where: { transactionId: transaction.id, status: { in: ['SUBMITTED_TO_PSP', 'PROCESSING', 'PENDING', 'APPROVED'] } },
    orderBy: { createdAt: 'desc' },
  });

  // How much did this refund actually take out of OUR balance? Read from
  // Stripe's own balance transaction rather than assuming it equals the
  // refund amount — Stripe doesn't always return its processing fee on a
  // refund, and guessing gets the hospital's owed amount slightly wrong.
  let reductionMinor = Math.round(Number(pendingRefund?.amount || 0) * 100);
  if (pendingRefund?.stripeRefundId) {
    try {
      const retrieveOpts = transaction.stripeConnectedAccountId ? { stripeAccount: transaction.stripeConnectedAccountId } : {};
      const refundObj = await stripe.refunds.retrieve(pendingRefund.stripeRefundId, {
        expand: ['balance_transaction'],
      }, retrieveOpts);
      if (refundObj.balance_transaction) {
        reductionMinor = Math.abs(refundObj.balance_transaction.net);
      }
    } catch (err) {
      console.error(`[webhook] charge.refunded: could not read balance transaction for refund ${pendingRefund.stripeRefundId}, using requested amount instead:`, err.message);
    }
  }

  if (pendingRefund) {
    await prisma.refund.update({
      where: { id: pendingRefund.id },
      data: { status: 'COMPLETED', processedAt: new Date() },
    });
  } else {
    console.error(`[webhook] charge.refunded for transaction ${transaction.id} but no active Refund row found.`);
  }

  const fullyRefunded = charge.amount_refunded >= charge.amount;
  const newHospitalNetAmountMinor = Math.max(0, Math.round(Number(transaction.hospitalNetAmount) * 100) - reductionMinor);

  await prisma.transaction.update({
    where: { id: transaction.id },
    data: {
      status: fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      hospitalNetAmount: newHospitalNetAmountMinor / 100,
    },
  });

  // If this transaction's money already left the platform balance, recover
  // it from the hospital now — via transfer reversal, or an open adjustment
  // netted off their next settlement if the funds are already paid out.
  if (transaction.transferStatus === 'TRANSFERRED') {
    await recoverFromHospital({ transaction, amountMinor: reductionMinor, reason: `Refund on transaction ${transaction.id}` });
  }
}

// ─── charge.dispute.created handler ───────────────────────────────────────────
async function handleDisputeCreated(dispute) {
  const paymentIntentId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id;
  const transaction = await prisma.transaction.findUnique({ where: { stripePaymentIntentId: paymentIntentId } });
  if (!transaction) {
    console.error('[webhook] charge.dispute.created for unknown payment_intent:', paymentIntentId);
    return;
  }

  await prisma.dispute.upsert({
    where: { stripeDisputeId: dispute.id },
    update: {},
    create: {
      transactionId: transaction.id,
      stripeDisputeId: dispute.id,
      amount: dispute.amount / 100,
      // Stripe's dispute fee isn't reliably present on the dispute object itself
      // (it shows up as a balance transaction) — leave at 0 for now rather than
      // guessing a figure; a later phase can backfill it from
      // dispute.balance_transactions if/when this needs to be exact.
      disputeFee: 0,
      reason: dispute.reason || null,
      status: 'NEEDS_RESPONSE',
      evidenceDueBy: dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000) : null,
    },
  });

  await prisma.transaction.update({ where: { id: transaction.id }, data: { status: 'DISPUTED' } });

  console.error(`[CRITICAL][webhook] Dispute opened on transaction ${transaction.id} (appointment ${transaction.appointmentId}) — needs human review before evidenceDueBy.`);
}

// ─── charge.dispute.closed handler ────────────────────────────────────────────
async function handleDisputeClosed(dispute) {
  const disputeRow = await prisma.dispute.findUnique({ where: { stripeDisputeId: dispute.id } });
  if (!disputeRow) {
    console.error('[webhook] charge.dispute.closed for unknown dispute:', dispute.id);
    return;
  }

  const statusMap = { won: 'WON', lost: 'LOST' };
  const mappedStatus = statusMap[dispute.status] || 'UNDER_REVIEW';

  await prisma.dispute.update({
    where: { id: disputeRow.id },
    data: { status: mappedStatus, outcome: dispute.status },
  });

  if (mappedStatus === 'LOST') {
    // Money left the hospital's balance permanently via the chargeback —
    // functionally the same end state as a processed refund.
    await prisma.transaction.update({ where: { id: disputeRow.transactionId }, data: { status: 'REFUNDED' } });

    const transaction = await prisma.transaction.findUnique({ where: { id: disputeRow.transactionId } });
    if (transaction?.transferStatus === 'TRANSFERRED') {
      const amountMinor = Math.round(Number(disputeRow.amount) * 100);
      await recoverFromHospital({ transaction, amountMinor, reason: `Lost dispute on transaction ${transaction.id}` });
    }
  } else if (mappedStatus === 'WON') {
    await prisma.transaction.update({ where: { id: disputeRow.transactionId }, data: { status: 'SUCCESS' } });
  }
}

// ─── GET /api/payments/stripe/sync-status ─────────────────────────────────────

/**
 * HOSPITAL_ADMIN — Fetches live Stripe account status directly from the Stripe
 * API and syncs it to the DB. This is the fallback when webhooks are not delivered
 * (e.g. local dev without Stripe CLI, or any missed webhook event).
 *
 * Returns the same shape as GET /hospital/stripe-status so the frontend can use
 * either endpoint interchangeably.
 */
async function syncStripeStatus(req, res) {
  const role = req.headers['x-user-role'];
  if (role !== 'HOSPITAL_ADMIN' && role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }

  // For HOSPITAL_ADMIN, hospitalId comes from x-tenant-id (set by JWT in gateway).
  // For SUPER_ADMIN, allow passing hospitalId via query param.
  const hospitalId = role === 'SUPER_ADMIN'
    ? (req.query.hospitalId || req.headers['x-tenant-id'])
    : req.headers['x-tenant-id'];

  if (!hospitalId) {
    return res.status(400).json({ success: false, message: 'Missing hospital ID.' });
  }

  // 1. Get current DB record from super-admin-service
  let hospital;
  try {
    const r = await axios.get(
      `${superAdminBase()}/internal/hospital/${hospitalId}/stripe-status`,
      { headers: superAdminHeaders() }
    );
    hospital = r.data?.data;
  } catch (err) {
    if (err?.response?.status === 404) {
      return res.status(200).json({
        success: true,
        data: { stripeAccountId: null, stripeOnboardingStatus: 'NOT_STARTED', stripeChargesEnabled: false, stripePayoutsEnabled: false },
      });
    }
    return res.status(502).json({ success: false, message: 'Could not reach super-admin-service.' });
  }

  const stripeAccountId = hospital?.stripeAccountId;
  if (!stripeAccountId) {
    return res.status(200).json({
      success: true,
      data: { stripeAccountId: null, stripeOnboardingStatus: 'NOT_STARTED', stripeChargesEnabled: false, stripePayoutsEnabled: false },
    });
  }

  // 2. Fetch live data directly from Stripe
  let liveAccount;
  try {
    liveAccount = await stripe.accounts.retrieve(stripeAccountId);
  } catch (stripeErr) {
    console.warn(`[stripe/syncStatus] Failed to retrieve ${stripeAccountId} from Stripe:`, stripeErr.message);
    // Return whatever is in the DB — don't fail the whole request
    return res.status(200).json({ success: true, data: hospital });
  }

  const chargesEnabled  = liveAccount.charges_enabled  ?? false;
  const payoutsEnabled  = liveAccount.payouts_enabled  ?? false;
  const disabledReason  = liveAccount.requirements?.disabled_reason;

  let stripeOnboardingStatus;
  if (chargesEnabled && payoutsEnabled) {
    stripeOnboardingStatus = 'COMPLETE';
  } else if (disabledReason) {
    stripeOnboardingStatus = 'RESTRICTED';
  } else {
    stripeOnboardingStatus = 'PENDING';
  }

  // 3. Only write to DB if the status has changed (avoid unnecessary writes)
  if (
    stripeOnboardingStatus !== hospital.stripeOnboardingStatus ||
    chargesEnabled          !== hospital.stripeChargesEnabled  ||
    payoutsEnabled          !== hospital.stripePayoutsEnabled
  ) {
    try {
      await axios.patch(
        `${superAdminBase()}/internal/hospital/by-stripe-account/${stripeAccountId}/stripe-status`,
        { stripeOnboardingStatus, stripeChargesEnabled: chargesEnabled, stripePayoutsEnabled: payoutsEnabled },
        { headers: superAdminHeaders() }
      );
      console.log(`[stripe/syncStatus] Synced ${stripeAccountId}: ${hospital.stripeOnboardingStatus} → ${stripeOnboardingStatus}`);
    } catch (patchErr) {
      console.error('[stripe/syncStatus] DB patch failed:', patchErr?.response?.data || patchErr.message);
    }
  }

  return res.status(200).json({
    success: true,
    data: {
      stripeAccountId,
      stripeOnboardingStatus,
      stripeChargesEnabled: chargesEnabled,
      stripePayoutsEnabled: payoutsEnabled,
    },
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  rejectIfNotSuperAdmin,
  createConnectedAccount,
  createOnboardingLink,
  createOwnOnboardingLink,
  syncStripeStatus,
  handleWebhook,
  handleConnectWebhook,
};

