'use strict';

const axios = require('axios');
const stripe = require('../config/stripeClient');
const prisma = require('../config/prismaClient');
const { rejectIfNotSuperAdmin } = require('../utils/roleGuards');
const { processRefund } = require('./refund.controller');
const { recoverFromHospital } = require('./settlement.controller');

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

// ─── POST /api/payments/stripe/accounts ───────────────────────────────────────

/**
 * Creates a Stripe Custom connected account for a hospital.
 *
 * 1. Validates caller is SUPER_ADMIN (via x-user-role header set by the gateway).
 * 2. Creates a Stripe Custom account (country AE, card_payments + transfers).
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

  // Create the Custom connected account on Stripe.
  // UAE platforms can only use Custom accounts — Express and Standard are not
  // supported configurations for a UAE-based platform (Stripe Connect docs,
  // confirmed Sep 2026). See DoctorNow_Stripe_Architecture_Final.html §2.
  const account = await stripe.accounts.create({
    type: 'custom',
    country: 'AE',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { hospitalId },
  });

  // Persist the account id and set status to PENDING in super-admin-service
  try {
    await axios.patch(
      `${superAdminBase()}/internal/hospital/${hospitalId}/stripe-status`,
      { stripeAccountId: account.id, stripeOnboardingStatus: 'PENDING' },
      { headers: superAdminHeaders() }
    );
  } catch (superAdminErr) {
    // The Stripe account was created but we couldn't store it — log and surface
    // the error so the caller knows the DB write failed. The account can be
    // re-linked manually if needed.
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
    message: 'Stripe Custom connected account created.',
    data: { stripeAccountId: account.id, hospitalId },
  });
}

// ─── POST /api/payments/stripe/accounts/:hospitalId/onboarding-link ───────────

/**
 * Generates a Stripe Account Link for onboarding / re-onboarding.
 *
 * 1. Validates caller is SUPER_ADMIN.
 * 2. Fetches the hospital from super-admin-service to get its stripeAccountId.
 * 3. Creates a Stripe Account Link and returns the URL.
 *
 * The frontend redirects the hospital admin to this URL; Stripe handles the rest.
 */
async function createOnboardingLink(req, res) {
  if (rejectIfNotSuperAdmin(req, res)) return;

  const { hospitalId } = req.params;

  // Fetch hospital record to get stripeAccountId
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
    console.error('[stripe/createOnboardingLink] Failed to fetch hospital:', err?.response?.data || err.message);
    return res.status(502).json({ success: false, message: 'Could not fetch hospital from super-admin-service.' });
  }

  const stripeAccountId = hospital?.stripeAccountId;
  if (!stripeAccountId) {
    return res.status(422).json({
      success: false,
      message:
        `Hospital ${hospitalId} does not have a Stripe account yet. ` +
        'Call POST /api/payments/stripe/accounts first.',
    });
  }

  const refreshUrl = process.env.STRIPE_CONNECT_ONBOARDING_REFRESH_URL;
  const returnUrl = process.env.STRIPE_CONNECT_ONBOARDING_RETURN_URL;
  if (!refreshUrl || !returnUrl) {
    return res.status(500).json({
      success: false,
      message: 'STRIPE_CONNECT_ONBOARDING_REFRESH_URL / RETURN_URL not configured.',
    });
  }

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });

  return res.status(200).json({
    success: true,
    data: { url: accountLink.url, expiresAt: accountLink.expires_at },
  });
}

// ─── POST /api/payments/stripe/webhook ────────────────────────────────────────

/**
 * Stripe webhook endpoint.
 *
 * IMPORTANT: This handler receives a raw (Buffer) body, not JSON-parsed.
 * The route MUST be registered with express.raw({type:'application/json'})
 * BEFORE any global express.json() middleware reaches it.
 * See app.js for how this is wired.
 *
 * Flow:
 *   1. Verify Stripe signature → 400 on failure.
 *   2. Idempotency check → 200 immediately if already processed.
 *   3. Switch on event type.
 *   4. Insert into ProcessedWebhookEvent.
 *
 * NOTE on downstream failures: if the internal call to super-admin-service
 * fails after Stripe's signature was valid, we log the error but still return
 * 200. Returning non-200 would cause Stripe to retry indefinitely, which is
 * wrong when the problem is on our side. These failures need human review —
 * a retry/dead-letter queue can be added in a later phase.
 */
async function handleWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  let event;
  try {
    // req.body is a raw Buffer here — do not call JSON.parse on it.
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.warn('[stripe/webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // ── Idempotency check ──
  const existing = await prisma.processedWebhookEvent.findUnique({
    where: { id: event.id },
  });
  if (existing) {
    console.log(`[stripe/webhook] Duplicate event ignored: ${event.id} (${event.type})`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  // ── Dispatch ──
  switch (event.type) {
    case 'account.updated':
      await handleAccountUpdated(event);
      break;

    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object);
      break;

    case 'checkout.session.expired':
      await handleCheckoutExpired(event.data.object);
      break;

    case 'payment_intent.payment_failed':
      // Note: With hosted Checkout in mode: 'payment', a declined card does not end the session.
      // The customer can retry with a different card in the same session.
      // checkout.session.expired is the authoritative failure signal.
      console.log(`[stripe/webhook] payment_intent.payment_failed logged: id=${event.id}`);
      break;

    case 'charge.refunded':
      await handleChargeRefunded(event.data.object);
      break;

    case 'charge.dispute.created':
      await handleDisputeCreated(event.data.object);
      break;

    case 'charge.dispute.closed':
      await handleDisputeClosed(event.data.object);
      break;

    default:
      // Unknown event — acknowledge and move on.
      console.log(`[stripe/webhook] Unhandled event type '${event.type}' (id=${event.id}) — acknowledged.`);
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
    // Log and return — do NOT re-throw. Throwing here would cause the webhook
    // handler to surface a 500 → Stripe would retry the event. The problem is
    // a downstream failure on super-admin-service; retrying won't help and
    // would flood logs. This needs a human to investigate.
    console.error(
      `[stripe/webhook] account.updated (event.id=${event.id}): ` +
      `Failed to update super-admin-service for stripeAccountId=${stripeAccountId}:`,
      err?.response?.data || err.message
    );
  }
}

// ─── checkout.session.completed handler ──────────────────────────────────────

async function handleCheckoutCompleted(session) {
  const appointmentId = session.metadata?.appointmentId;
  if (!appointmentId) {
    console.error('[webhook] checkout.session.completed with no appointmentId in metadata:', session.id);
    return;
  }

  await prisma.transaction.updateMany({
    where: { stripeCheckoutSessionId: session.id, status: 'PENDING' },
    data: {
      status: 'SUCCESS',
      stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
    },
  });

  // Stripe's exact processing fee for this charge — not a fixed formula,
  // pulled from the balance transaction so this is always exactly right,
  // including any per-card-type variation. This is what "hospitalNetAmount"
  // should have always meant: gross minus Stripe's fee, never minus
  // commission — commission is invoiced separately and never netted out of
  // what the hospital is paid.
  try {
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge.balance_transaction'],
    });
    const stripeFeeMinor = pi.latest_charge?.balance_transaction?.fee ?? 0;
    const grossMinor = Math.round(Number((await prisma.transaction.findFirst({ where: { stripeCheckoutSessionId: session.id } }))?.grossAmount || 0) * 100);

    await prisma.transaction.updateMany({
      where: { stripeCheckoutSessionId: session.id, paidAt: null },
      data: {
        stripeFeeAmount: stripeFeeMinor / 100,
        hospitalNetAmount: (grossMinor - stripeFeeMinor) / 100,
        paidAt: new Date(),
      },
    });
  } catch (err) {
    // Don't let this fail the whole webhook handler — the appointment is
    // already confirmed as paid above, which is the part that must not be
    // rolled back. A missing hospitalNetAmount here just means this
    // transaction won't show up as settlement-ready until it's backfilled;
    // log loudly so it gets caught.
    console.error(`[CRITICAL][webhook] Failed to compute hospitalNetAmount for session ${session.id}:`, err.message);
  }

  try {
    await axios.patch(
      `${process.env.APPOINTMENT_SERVICE_URL}/api/appointments/internal/${appointmentId}/payment-outcome`,
      { outcome: 'PAID' },
      { headers: { 'x-internal-sig': process.env.INTERNAL_SERVICE_SECRET } }
    );
  } catch (err) {
    if (err?.response?.data?.code === 'APPOINTMENT_ALREADY_CANCELLED') {
      // The appointment was cancelled through some other path before this
      // payment could be confirmed — but Stripe has already charged the
      // hospital's account and taken our commission for a booking that no
      // longer exists. Refund it automatically and log loudly for a human
      // to see, rather than leaving the patient charged for nothing.
      console.error(`[CRITICAL][webhook] Appointment ${appointmentId} was already cancelled when payment confirmed — issuing automatic full refund.`);
      const transaction = await prisma.transaction.findFirst({ where: { stripeCheckoutSessionId: session.id } });
      if (transaction) {
        try {
          await processRefund({
            transactionId: transaction.id,
            amount: Number(transaction.grossAmount),
            reasonCategory: 'ADMIN_MANUAL',
            reason: 'Automatic refund: appointment was cancelled before payment confirmation could be applied.',
            refundCommission: true,
            initiatedBy: 'SYSTEM',
            initiatedByRole: 'SYSTEM_RECONCILIATION',
          });
        } catch (refundErr) {
          console.error(`[CRITICAL][webhook] Automatic refund for orphaned payment on appointment ${appointmentId} FAILED — needs manual handling:`, refundErr.message);
        }
      } else {
        console.error(`[CRITICAL][webhook] No transaction found for orphaned-payment appointment ${appointmentId} — cannot auto-refund, needs manual handling.`);
      }
      return;
    }
    // Do not throw — this would make Stripe retry the whole webhook, including
    // the already-successful Transaction update above. Log loudly; the
    // reconciliation cron will catch a stuck PENDING
    // appointment with a SUCCESS transaction and retry the confirmation.
    console.error(`[webhook] Failed to confirm appointment ${appointmentId} as paid:`, err?.response?.data || err.message);
  }
}

// ─── checkout.session.expired handler ────────────────────────────────────────

async function handleCheckoutExpired(session) {
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
    where: { transactionId: transaction.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });

  // How much did this refund actually take out of OUR balance? Read from
  // Stripe's own balance transaction rather than assuming it equals the
  // refund amount — Stripe doesn't always return its processing fee on a
  // refund, and guessing gets the hospital's owed amount slightly wrong.
  let reductionMinor = Math.round(Number(pendingRefund?.amount || 0) * 100);
  if (pendingRefund?.stripeRefundId) {
    try {
      const refundObj = await stripe.refunds.retrieve(pendingRefund.stripeRefundId, {
        expand: ['balance_transaction'],
      });
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
      data: { status: 'PROCESSED', processedAt: new Date() },
    });
  } else {
    console.error(`[webhook] charge.refunded for transaction ${transaction.id} but no PENDING Refund row found — refund may have been created outside this service.`);
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

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  rejectIfNotSuperAdmin,
  createConnectedAccount,
  createOnboardingLink,
  handleWebhook,
};
