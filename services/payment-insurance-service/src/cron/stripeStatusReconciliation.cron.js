'use strict';

/**
 * stripeStatusReconciliation.cron.js
 * payment-insurance-service
 *
 * PURPOSE: Independent backup for Stripe Connect onboarding status.
 *
 * Stripe sends `account.updated` webhooks when a connected account's status
 * changes. But webhooks can fail — network issues, server downtime, local
 * development environments without public endpoints, etc.
 *
 * This cron polls Stripe directly every 15 minutes for every hospital whose
 * onboarding status is still PENDING or RESTRICTED, and auto-updates the DB
 * if the live status differs. It is completely independent of webhooks.
 *
 * Result: A hospital that completes Stripe onboarding will always see their
 * status update within 15 minutes — even if every webhook was dropped.
 */

const cron = require('node-cron');
const axios = require('axios');
const stripe = require('../config/stripeClient');

function superAdminBase() {
  const base = process.env.SUPER_ADMIN_SERVICE_URL;
  if (!base) throw new Error('SUPER_ADMIN_SERVICE_URL is not configured');
  return base;
}

function superAdminHeaders() {
  return {
    'x-internal-sig': process.env.INTERNAL_SERVICE_SECRET,
    'Content-Type': 'application/json',
  };
}

/**
 * Main reconciliation job — fetches all PENDING/RESTRICTED hospitals from
 * super-admin-service, retrieves their live Stripe status, and patches any
 * that have changed.
 */
async function reconcileStripeAccountStatuses() {
  // 1. Get all hospitals with non-terminal stripe status from super-admin-service
  let hospitals;
  try {
    const r = await axios.get(
      `${superAdminBase()}/internal/hospitals/stripe-pending`,
      { headers: superAdminHeaders() }
    );
    hospitals = r.data?.data || [];
  } catch (err) {
    console.error('[stripeStatusCron] Failed to fetch pending hospitals:', err?.response?.data || err.message);
    return;
  }

  if (!hospitals.length) {
    return; // Nothing to do
  }

  console.log(`[stripeStatusCron] Checking ${hospitals.length} hospital(s) with PENDING/RESTRICTED Stripe accounts...`);

  let updated = 0;
  let unchanged = 0;
  let errored = 0;

  for (const hospital of hospitals) {
    const { stripeAccountId, stripeOnboardingStatus: dbStatus, id: hospitalId } = hospital;
    if (!stripeAccountId) continue;

    try {
      // 2. Fetch live status from Stripe
      const liveAccount = await stripe.accounts.retrieve(stripeAccountId);

      const chargesEnabled = liveAccount.charges_enabled  ?? false;
      const payoutsEnabled = liveAccount.payouts_enabled  ?? false;
      const disabledReason = liveAccount.requirements?.disabled_reason;

      let liveStatus;
      if (chargesEnabled && payoutsEnabled) {
        liveStatus = 'COMPLETE';
      } else if (disabledReason) {
        liveStatus = 'RESTRICTED';
      } else {
        liveStatus = 'PENDING';
      }

      // 3. Only patch if something changed
      if (
        liveStatus !== dbStatus ||
        chargesEnabled !== hospital.stripeChargesEnabled ||
        payoutsEnabled !== hospital.stripePayoutsEnabled
      ) {
        await axios.patch(
          `${superAdminBase()}/internal/hospital/by-stripe-account/${stripeAccountId}/stripe-status`,
          {
            stripeOnboardingStatus: liveStatus,
            stripeChargesEnabled:   chargesEnabled,
            stripePayoutsEnabled:   payoutsEnabled,
          },
          { headers: superAdminHeaders() }
        );
        console.log(
          `[stripeStatusCron] Hospital ${hospitalId} (${stripeAccountId}): ` +
          `${dbStatus} => ${liveStatus} (charges=${chargesEnabled}, payouts=${payoutsEnabled})`
        );
        updated++;
      } else {
        unchanged++;
      }
    } catch (err) {
      // If Stripe says the account doesn't exist (deleted), clear it from DB
      // so the next onboarding request triggers a fresh account creation.
      if (err?.statusCode === 404 || /no such account/i.test(err?.message || '')) {
        console.warn(
          `[stripeStatusCron] Stripe account ${stripeAccountId} no longer exists. ` +
          `Clearing stripeAccountId for hospital ${hospitalId}.`
        );
        try {
          await axios.patch(
            `${superAdminBase()}/internal/hospital/${hospitalId}/stripe-status`,
            { stripeAccountId: null, stripeOnboardingStatus: 'NOT_STARTED', stripeChargesEnabled: false, stripePayoutsEnabled: false },
            { headers: superAdminHeaders() }
          );
        } catch (clearErr) {
          console.error(`[stripeStatusCron] Failed to clear deleted account for hospital ${hospitalId}:`, clearErr.message);
        }
      } else {
        console.error(`[stripeStatusCron] Error checking account ${stripeAccountId}:`, err?.message);
      }
      errored++;
    }
  }

  if (updated > 0 || errored > 0) {
    console.log(`[stripeStatusCron] Done -- ${updated} updated, ${unchanged} unchanged, ${errored} errors.`);
  }
}

// Run every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  try {
    await reconcileStripeAccountStatuses();
  } catch (err) {
    console.error('[stripeStatusCron] Unhandled error in reconciliation job:', err.message);
  }
});

module.exports = { reconcileStripeAccountStatuses };
