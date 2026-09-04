import express from 'express';
import { internalAuth } from '../middlewares/internalAuth.js';
import {
  patchStripeStatusById,
  patchStripeStatusByStripeAccountId,
  getCommissionRateByHospitalId,
  getStripeStatusByHospitalId,
} from '../controllers/internalStripeStatus.controller.js';

const router = express.Router();

// Every route on this router requires a valid x-internal-sig header
router.use(internalAuth);

/**
 * GET /internal/hospital/:hospitalId/commission-rate
 * Returns only platformCommission and hospitalShare for the hospital.
 */
router.get('/hospital/:hospitalId/commission-rate', getCommissionRateByHospitalId);
router.get('/hospital/:hospitalId/stripe-status', getStripeStatusByHospitalId);

/**
 * PATCH /internal/hospital/:id/stripe-status
 * Update Stripe fields on a hospital by primary id.
 * Only stripeAccountId, stripeOnboardingStatus, stripeChargesEnabled,
 * stripePayoutsEnabled, payoutCadence are accepted in the body.
 */
router.patch('/hospital/:id/stripe-status', patchStripeStatusById);

/**
 * PATCH /internal/hospital/by-stripe-account/:stripeAccountId/stripe-status
 * Same update but looks up the hospital by its Stripe connected account id.
 * Returns 404 if no hospital has that stripeAccountId.
 */
router.patch(
  '/hospital/by-stripe-account/:stripeAccountId/stripe-status',
  patchStripeStatusByStripeAccountId
);

export default router;
