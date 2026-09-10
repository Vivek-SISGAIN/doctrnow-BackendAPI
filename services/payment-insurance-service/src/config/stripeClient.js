'use strict';

const Stripe = require('stripe');

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  // Warn loudly at startup — missing key means every Stripe call will throw.
  console.error(
    '[stripe-client] CRITICAL: STRIPE_SECRET_KEY is not set. ' +
    'All Stripe API calls will fail until this is configured.'
  );
}

/**
 * Singleton Stripe client configured from STRIPE_SECRET_KEY.
 * Import this module wherever Stripe API calls are needed.
 *
 * Usage:
 *   const stripe = require('../config/stripeClient');
 *   const account = await stripe.accounts.create({ ... });
 */
const stripe = Stripe(key || '', {
  // Do NOT pin apiVersion here — the old value (2024-06-20) was too old
  // to support the Accounts v2 SDK methods (stripe.v2.core.accounts).
  // The SDK's embedded default version is used instead, which is v2-compatible.
  maxNetworkRetries: 2, // Stripe SDK-level retries for transient network errors
});

module.exports = stripe;
