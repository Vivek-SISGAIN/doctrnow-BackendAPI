import prisma from '../prisma/client.js';

/**
 * Allowed Stripe-related fields that this internal endpoint may update.
 * Any key not in this set is silently ignored — this endpoint must never
 * allow callers to update general hospital data (name, license, etc.).
 */
const ALLOWED_STRIPE_FIELDS = new Set([
  'stripeAccountId',
  'stripeOnboardingStatus',
  'stripeChargesEnabled',
  'stripePayoutsEnabled',
  'payoutCadence',
]);

/**
 * PATCH /internal/hospital/:id/stripe-status
 * Updates Stripe-specific fields on a hospital identified by its primary id.
 */
export async function patchStripeStatusById(req, res) {
  const { id } = req.params;

  // Build update payload — only allowed stripe fields
  const data = buildStripeUpdatePayload(req.body);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Request body contains no recognised Stripe status fields.',
    });
  }

  try {
    const hospital = await prisma.hospital.update({
      where: { id },
      data,
      select: {
        id: true,
        stripeAccountId: true,
        stripeOnboardingStatus: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        payoutCadence: true,
        commissionInvoiceCycle: true,
      },
    });

    return res.status(200).json({ success: true, data: hospital });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, message: `Hospital ${id} not found.` });
    }
    throw err; // Let global error handler deal with it
  }
}

/**
 * PATCH /internal/hospital/by-stripe-account/:stripeAccountId/stripe-status
 * Updates Stripe-specific fields on a hospital identified by its Stripe account id.
 */
export async function patchStripeStatusByStripeAccountId(req, res) {
  const { stripeAccountId } = req.params;

  const data = buildStripeUpdatePayload(req.body);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Request body contains no recognised Stripe status fields.',
    });
  }

  try {
    const hospital = await prisma.hospital.update({
      where: { stripeAccountId },
      data,
      select: {
        id: true,
        stripeAccountId: true,
        stripeOnboardingStatus: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
        payoutCadence: true,
        commissionInvoiceCycle: true,
      },
    });

    return res.status(200).json({ success: true, data: hospital });
  } catch (err) {
    if (err.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: `No hospital found with stripeAccountId '${stripeAccountId}'.`,
      });
    }
    throw err;
  }
}

/**
 * GET /internal/hospital/:hospitalId/commission-rate
 * Returns only the platformCommission and hospitalShare for the given hospitalId.
 */
export async function getCommissionRateByHospitalId(req, res) {
  const { hospitalId } = req.params;
  const hospital = await prisma.hospital.findUnique({
    where: { id: hospitalId },
    select: {
      commissionInvoiceCycle: true,
      finance: { select: { platformCommission: true, hospitalShare: true } },
    },
  });
  if (!hospital || !hospital.finance) {
    return res.status(404).json({
      success: false,
      message: `No commission terms configured for hospital ${hospitalId}.`,
    });
  }
  return res.status(200).json({
    success: true,
    data: {
      platformCommission: hospital.finance.platformCommission,
      hospitalShare: hospital.finance.hospitalShare,
      commissionInvoiceCycle: hospital.commissionInvoiceCycle,
    },
  });
}

export async function getStripeStatusByHospitalId(req, res) {
  const { hospitalId } = req.params;
  const hospital = await prisma.hospital.findUnique({
    where: { id: hospitalId },
    select: {
      stripeAccountId: true,
      stripeOnboardingStatus: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
    },
  });
  if (!hospital) {
    return res.status(404).json({ success: false, message: `Hospital ${hospitalId} not found.` });
  }
  return res.status(200).json({ success: true, data: hospital });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Picks only the allowed Stripe fields from an arbitrary body object.
 * Silently ignores everything else so callers cannot overwrite hospital data.
 */
function buildStripeUpdatePayload(body) {
  const data = {};
  for (const [key, value] of Object.entries(body ?? {})) {
    if (ALLOWED_STRIPE_FIELDS.has(key)) {
      data[key] = value;
    }
  }
  return data;
}
