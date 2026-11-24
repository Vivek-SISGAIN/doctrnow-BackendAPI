'use strict';

const axios = require('axios');
const stripe = require('../config/stripeClient');
const prisma = require('../config/prismaClient');

const SUPER_ADMIN_URL = process.env.SUPER_ADMIN_SERVICE_URL;
const PROFILE_URL = process.env.PROFILE_SERVICE_URL;
const APPOINTMENT_URL = process.env.APPOINTMENT_SERVICE_URL;
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;

function internalHeaders() {
  return { 'x-internal-sig': INTERNAL_SECRET };
}

// consultationType → profile-service fee field. CHAT has no fee field defined
// anywhere in the platform yet (Doctor model only has videoConsultationFee,
// phoneConsultationFee, followUpFee) — reject it explicitly rather than
// guessing a price, so we never charge the wrong amount for an unpriced type.
const FEE_FIELD_BY_TYPE = {
  VIDEO: 'videoConsultationFee',
  AUDIO: 'phoneConsultationFee',
};

async function createCheckoutSession(req, res) {
  const patientId = req.headers['x-user-id'];
  const userRole = req.headers['x-user-role'];
  if (!patientId || userRole !== 'PATIENT') {
    return res.status(403).json({ success: false, message: 'Only an authenticated patient can start a checkout.' });
  }

  const { doctorId, hospitalId, slotId, consultationType, familyMemberId, reason, notes, patientId: clientPatientId } = req.body;
  if (!doctorId || !hospitalId || !slotId || !consultationType) {
    return res.status(400).json({ success: false, message: 'doctorId, hospitalId, slotId, and consultationType are required.' });
  }

  // Resolve the patient profile ID so appointment.patientId matches what the patient frontend queries (profile.id)
  let resolvedPatientId = clientPatientId || patientId;
  let resolvedPatientName = null;
  let resolvedPatientEmail = null;
  try {
    const pRes = await axios.get(`${PROFILE_URL}/api/patients/me`, {
      headers: {
        'x-user-id': patientId,
        'x-user-role': userRole,
        Authorization: req.headers.authorization || '',
      },
      timeout: 5000,
    });
    if (pRes.data?.data) {
      if (pRes.data.data.id) resolvedPatientId = pRes.data.data.id;
      resolvedPatientName = [pRes.data.data.firstName, pRes.data.data.lastName].filter(Boolean).join(' ') || null;
      resolvedPatientEmail = pRes.data.data.email || null;
    }
  } catch (err) {
    console.warn('[checkout] Could not resolve patient profile:', err.message);
  }

  const feeField = FEE_FIELD_BY_TYPE[consultationType];
  if (!feeField) {
    return res.status(422).json({
      success: false,
      message: `Payment for consultationType "${consultationType}" is not supported yet — no fee is configured for it.`,
    });
  }

  // 1. Lock the slot briefly to prevent a race while we do the pre-checks below.
  //    appointment-service's create() already unlocks it once the appointment
  //    row exists (step 4), so this lock only needs to cover this handler's
  //    short pre-check window, not the whole Stripe checkout duration — the
  //    slot's own status flips to BOOKED once the appointment is created,
  //    and that (not the lock) is what actually prevents double-booking while
  //    the patient is on Stripe's page.
  try {
    await axios.post(`${APPOINTMENT_URL}/api/slots/${slotId}/lock`, { lockedBy: resolvedPatientId, expiresInMinutes: 5 });
  } catch (err) {
    if (err?.response?.status === 409) {
      return res.status(409).json({ success: false, message: 'This slot is currently being booked by someone else. Please try again shortly.' });
    }
    if (err?.response?.status === 404) {
      return res.status(404).json({ success: false, message: 'Slot not found.' });
    }
    console.error('[checkout] Failed to lock slot:', err?.response?.data || err.message);
    return res.status(502).json({ success: false, message: 'Could not reserve the slot.' });
  }

  const releaseLockAndFail = async (status, message) => {
    await axios.post(`${APPOINTMENT_URL}/api/slots/${slotId}/unlock`).catch(() => {});
    return res.status(status).json({ success: false, message });
  };

  // 2. Doctor fee (server-computed — never trust a client-supplied amount).
  let doctor;
  try {
    const r = await axios.get(`${PROFILE_URL}/api/doctors/${doctorId}`);
    doctor = r.data?.data || r.data;
  } catch (err) {
    if (err?.response?.status === 404) return releaseLockAndFail(404, 'Doctor not found.');
    console.error('[checkout] Failed to fetch doctor:', err?.response?.data || err.message);
    return releaseLockAndFail(502, 'Could not fetch doctor details.');
  }
  const fee = doctor?.[feeField];
  if (fee == null) {
    return releaseLockAndFail(422, `Doctor has no ${feeField} configured.`);
  }

  // 3. Hospital must be able to accept charges.
  let hospital;
  try {
    const r = await axios.get(`${SUPER_ADMIN_URL}/api/super-admins/hospital/${hospitalId}`, { headers: internalHeaders() });
    hospital = r.data?.data || r.data;
  } catch (err) {
    if (err?.response?.status === 404) return releaseLockAndFail(404, 'Hospital not found.');
    console.error('[checkout] Failed to fetch hospital:', err?.response?.data || err.message);
    return releaseLockAndFail(502, 'Could not fetch hospital details.');
  }
  if (!hospital?.stripeChargesEnabled || !hospital?.stripeAccountId) {
    return releaseLockAndFail(422, 'This hospital is not yet able to accept payments.');
  }

  // 4. Commission rate for this hospital.
  let commission;
  try {
    const r = await axios.get(`${SUPER_ADMIN_URL}/internal/hospital/${hospitalId}/commission-rate`, { headers: internalHeaders() });
    commission = r.data?.data;
  } catch (err) {
    if (err?.response?.status === 404) return releaseLockAndFail(422, 'This hospital has no commission terms configured.');
    console.error('[checkout] Failed to fetch commission rate:', err?.response?.data || err.message);
    return releaseLockAndFail(502, 'Could not fetch commission terms.');
  }

  const grossAmountMinor = Math.round(Number(fee) * 100);
  const commissionAmountMinor = Math.round(grossAmountMinor * (Number(commission.platformCommission) / 100));

  // Extract immutable Bucket 2 policy snapshot for this booking
  const policySnapshot = {
    policyVersion: hospital.refundPolicyVersion || '1.0.0-DEFAULT',
    freeCancellationHours: hospital.cancellationCutoffHours != null ? Number(hospital.cancellationCutoffHours) : 4,
    lateCancellationFeePercent: hospital.lateCancellationFeePercent != null ? Number(hospital.lateCancellationFeePercent) : 50,
    nearTimeNoShowHours: hospital.nearTimeNoShowHours != null ? Number(hospital.nearTimeNoShowHours) : 1,
    patientGraceMinutes: hospital.patientGraceMinutes != null ? Number(hospital.patientGraceMinutes) : 10,
    doctorGraceMinutes: hospital.doctorGraceMinutes != null ? Number(hospital.doctorGraceMinutes) : 10,
    displayedSummary: `Free cancellation up to ${hospital.cancellationCutoffHours ?? 4} hours before appointment. Late cancellation fee of ${hospital.lateCancellationFeePercent ?? 50}% inside ${hospital.cancellationCutoffHours ?? 4} hours. Non-refundable within ${hospital.nearTimeNoShowHours ?? 1} hour.`,
    capturedAt: new Date().toISOString(),
  };

  // 5. Create the PENDING appointment. Reuses the existing public create
  //    endpoint on purpose — omitting status/paymentStatus from the body
  //    makes it default to PENDING/PENDING (see appointment.service.js
  //    create()), and this endpoint already has the slot-conflict +
  //    lock-ownership checks we need, so there's no reason to duplicate them.
  let appointment;
  try {
    const r = await axios.post(`${APPOINTMENT_URL}/api/appointments`, {
      patientId: resolvedPatientId, doctorId, hospitalId, slotId, consultationType, familyMemberId, reason, notes, policySnapshot,
    });
    appointment = r.data?.data || r.data;
  } catch (err) {
    console.error('[checkout] Failed to create pending appointment:', err?.response?.data || err.message);
    return releaseLockAndFail(err?.response?.status === 409 ? 409 : 502, err?.response?.data?.message || 'Could not create the appointment.');
  }

  // 6. Create the Stripe Checkout Session on the hospital's connected account
  //    (Direct Charges with Standard Connected Accounts).
  //    Stripe confirmed on Sept 10, 2026: Standard Connected Accounts + Direct Charges
  //    is the officially supported model for UAE platforms and UAE hospitals/clinics.
  //    Funds go directly to the hospital (Merchant of Record), bypassing DoctorNow's balance.
  let session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'aed',
            unit_amount: grossAmountMinor,
            product_data: { name: `Consultation — ${consultationType}` },
          },
          quantity: 1,
        }],
        metadata: { appointmentId: appointment.id, patientId: resolvedPatientId, hospitalId, doctorId, slotId },
        // Append appointmentId to the configured success URL per-session, so the
        // patient frontend knows which appointment to poll for confirmation
        // without needing a new "look up by session id" endpoint.
        success_url: `${process.env.PATIENT_APP_CHECKOUT_SUCCESS_URL}&appointmentId=${appointment.id}`,
        cancel_url: process.env.PATIENT_APP_CHECKOUT_CANCEL_URL,
        expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
      },
      {
        stripeAccount: hospital.stripeAccountId,
      }
    );
  } catch (err) {
    console.error('[checkout] Stripe session creation failed:', err.message);
    // The appointment already exists as PENDING — cancel it and free the slot
    // rather than leaving an orphaned PENDING appointment with no checkout.
    await axios.patch(`${APPOINTMENT_URL}/api/appointments/internal/${appointment.id}/payment-outcome`,
      { outcome: 'FAILED' }, { headers: internalHeaders() }).catch(() => {});
    return res.status(502).json({ success: false, message: 'Could not create the checkout session.' });
  }

  // 7. Ledger row with snapshot context for fast decoupled querying
  const doctorName = doctor?.fullName
    || [doctor?.user?.firstName, doctor?.user?.lastName].filter(Boolean).join(' ')
    || doctor?.name
    || (doctor?.firstName ? `${doctor.firstName} ${doctor.lastName || ''}`.trim() : null)
    || null;
  const doctorSpecialty = doctor?.primarySpecialization || doctor?.specialization || doctor?.specialty || null;
  const hospitalName = hospital?.officialName || hospital?.name || null;

  await prisma.transaction.create({
    data: {
      appointmentId: appointment.id,
      patientId: resolvedPatientId,
      patientName: resolvedPatientName,
      patientEmail: resolvedPatientEmail,
      hospitalId,
      doctorId,
      doctorName,
      doctorSpecialty,
      hospitalName,
      consultationType,
      grossAmount: fee,
      commissionAmount: commissionAmountMinor / 100,
      currency: 'aed',
      status: 'PENDING',
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
      stripeConnectedAccountId: hospital.stripeAccountId,
      paymentFlow: 'CHECKOUT_URL',
      policySnapshot,
    },
  });

  return res.status(201).json({
    success: true,
    data: { checkoutUrl: session.url, appointmentId: appointment.id, paymentFlow: 'CHECKOUT_URL' },
  });
}

/**
 * POST /api/payments/stripe/payment-intents
 * Mobile App / In-App Stripe Elements direct charge flow.
 * Creates a PaymentIntent on the hospital's connected Stripe account and returns clientSecret.
 */
async function createPaymentIntent(req, res) {
  const patientId = req.headers['x-user-id'];
  const userRole = req.headers['x-user-role'];
  if (!patientId || userRole !== 'PATIENT') {
    return res.status(403).json({ success: false, message: 'Only an authenticated patient can initiate a payment intent.' });
  }

  const { doctorId, hospitalId, slotId, consultationType, familyMemberId, reason, notes, patientId: clientPatientId } = req.body;
  if (!doctorId || !hospitalId || !slotId || !consultationType) {
    return res.status(400).json({ success: false, message: 'doctorId, hospitalId, slotId, and consultationType are required.' });
  }

  // Resolve the patient profile ID so appointment.patientId matches what the patient frontend queries (profile.id)
  let resolvedPatientId = clientPatientId || patientId;
  let resolvedPatientName = null;
  let resolvedPatientEmail = null;
  try {
    const pRes = await axios.get(`${PROFILE_URL}/api/patients/me`, {
      headers: {
        'x-user-id': patientId,
        'x-user-role': userRole,
        Authorization: req.headers.authorization || '',
      },
      timeout: 5000,
    });
    if (pRes.data?.data) {
      if (pRes.data.data.id) resolvedPatientId = pRes.data.data.id;
      resolvedPatientName = [pRes.data.data.firstName, pRes.data.data.lastName].filter(Boolean).join(' ') || null;
      resolvedPatientEmail = pRes.data.data.email || null;
    }
  } catch (err) {
    console.warn('[checkout/intent] Could not resolve patient profile:', err.message);
  }

  const feeField = FEE_FIELD_BY_TYPE[consultationType];
  if (!feeField) {
    return res.status(422).json({
      success: false,
      message: `Payment for consultationType "${consultationType}" is not supported yet — no fee is configured for it.`,
    });
  }

  // 1. Lock the slot briefly
  try {
    await axios.post(`${APPOINTMENT_URL}/api/slots/${slotId}/lock`, { lockedBy: resolvedPatientId, expiresInMinutes: 5 });
  } catch (err) {
    if (err?.response?.status === 409) {
      return res.status(409).json({ success: false, message: 'This slot is currently being booked by someone else. Please try again shortly.' });
    }
    if (err?.response?.status === 404) {
      return res.status(404).json({ success: false, message: 'Slot not found.' });
    }
    console.error('[checkout/intent] Failed to lock slot:', err?.response?.data || err.message);
    return res.status(502).json({ success: false, message: 'Could not reserve the slot.' });
  }

  const releaseLockAndFail = async (status, message) => {
    await axios.post(`${APPOINTMENT_URL}/api/slots/${slotId}/unlock`).catch(() => {});
    return res.status(status).json({ success: false, message });
  };

  // 2. Doctor fee
  let doctor;
  try {
    const r = await axios.get(`${PROFILE_URL}/api/doctors/${doctorId}`);
    doctor = r.data?.data || r.data;
  } catch (err) {
    if (err?.response?.status === 404) return releaseLockAndFail(404, 'Doctor not found.');
    console.error('[checkout/intent] Failed to fetch doctor:', err?.response?.data || err.message);
    return releaseLockAndFail(502, 'Could not fetch doctor details.');
  }
  const fee = doctor?.[feeField];
  if (fee == null) {
    return releaseLockAndFail(422, `Doctor has no ${feeField} configured.`);
  }

  // 3. Hospital Stripe readiness
  let hospital;
  try {
    const r = await axios.get(`${SUPER_ADMIN_URL}/api/super-admins/hospital/${hospitalId}`, { headers: internalHeaders() });
    hospital = r.data?.data || r.data;
  } catch (err) {
    if (err?.response?.status === 404) return releaseLockAndFail(404, 'Hospital not found.');
    console.error('[checkout/intent] Failed to fetch hospital:', err?.response?.data || err.message);
    return releaseLockAndFail(502, 'Could not fetch hospital details.');
  }
  if (!hospital?.stripeChargesEnabled || !hospital?.stripeAccountId) {
    return releaseLockAndFail(422, 'This hospital is not yet able to accept payments.');
  }

  // 4. Commission rate
  let commission;
  try {
    const r = await axios.get(`${SUPER_ADMIN_URL}/internal/hospital/${hospitalId}/commission-rate`, { headers: internalHeaders() });
    commission = r.data?.data;
  } catch (err) {
    if (err?.response?.status === 404) return releaseLockAndFail(422, 'This hospital has no commission terms configured.');
    console.error('[checkout/intent] Failed to fetch commission rate:', err?.response?.data || err.message);
    return releaseLockAndFail(502, 'Could not fetch commission terms.');
  }

  const grossAmountMinor = Math.round(Number(fee) * 100);
  const commissionAmountMinor = Math.round(grossAmountMinor * (Number(commission.platformCommission) / 100));

  // Extract immutable Bucket 2 policy snapshot for this booking
  const policySnapshot = {
    policyVersion: hospital.refundPolicyVersion || '1.0.0-DEFAULT',
    freeCancellationHours: hospital.cancellationCutoffHours != null ? Number(hospital.cancellationCutoffHours) : 4,
    lateCancellationFeePercent: hospital.lateCancellationFeePercent != null ? Number(hospital.lateCancellationFeePercent) : 50,
    nearTimeNoShowHours: hospital.nearTimeNoShowHours != null ? Number(hospital.nearTimeNoShowHours) : 1,
    patientGraceMinutes: hospital.patientGraceMinutes != null ? Number(hospital.patientGraceMinutes) : 10,
    doctorGraceMinutes: hospital.doctorGraceMinutes != null ? Number(hospital.doctorGraceMinutes) : 10,
    displayedSummary: `Free cancellation up to ${hospital.cancellationCutoffHours ?? 4} hours before appointment. Late cancellation fee of ${hospital.lateCancellationFeePercent ?? 50}% inside ${hospital.cancellationCutoffHours ?? 4} hours. Non-refundable within ${hospital.nearTimeNoShowHours ?? 1} hour.`,
    capturedAt: new Date().toISOString(),
  };

  // 5. Create PENDING appointment
  let appointment;
  try {
    const r = await axios.post(`${APPOINTMENT_URL}/api/appointments`, {
      patientId: resolvedPatientId, doctorId, hospitalId, slotId, consultationType, familyMemberId, reason, notes, policySnapshot,
    });
    appointment = r.data?.data || r.data;
  } catch (err) {
    console.error('[checkout/intent] Failed to create pending appointment:', err?.response?.data || err.message);
    return releaseLockAndFail(err?.response?.status === 409 ? 409 : 502, err?.response?.data?.message || 'Could not create the appointment.');
  }

  // 6. Create Stripe PaymentIntent directly on the hospital's connected account (Direct Charge)
  const doctorName = doctor?.fullName
    || [doctor?.user?.firstName, doctor?.user?.lastName].filter(Boolean).join(' ')
    || doctor?.name
    || (doctor?.firstName ? `${doctor.firstName} ${doctor.lastName || ''}`.trim() : null)
    || null;
  const doctorSpecialty = doctor?.primarySpecialization || doctor?.specialization || doctor?.specialty || null;
  const hospitalName = hospital?.officialName || hospital?.name || null;

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create(
      {
        amount: grossAmountMinor,
        currency: 'aed',
        automatic_payment_methods: { enabled: true },
        description: `Consultation — ${consultationType} with Dr. ${doctorName || 'Doctor'}`,
        metadata: {
          appointmentId: appointment.id,
          patientId: resolvedPatientId,
          hospitalId,
          doctorId,
          slotId,
          consultationType,
          commissionAmount: String(commissionAmountMinor / 100),
          paymentFlow: 'PAYMENT_INTENT',
        },
      },
      {
        stripeAccount: hospital.stripeAccountId,
      }
    );
  } catch (err) {
    console.error('[checkout/intent] Stripe PaymentIntent creation failed:', err.message);
    await axios.patch(`${APPOINTMENT_URL}/api/appointments/internal/${appointment.id}/payment-outcome`,
      { outcome: 'FAILED' }, { headers: internalHeaders() }).catch(() => {});
    return res.status(502).json({ success: false, message: 'Could not create the payment intent.' });
  }

  // 7. Ledger row with snapshot context and paymentFlow: 'PAYMENT_INTENT'
  await prisma.transaction.create({
    data: {
      appointmentId: appointment.id,
      patientId: resolvedPatientId,
      patientName: resolvedPatientName,
      patientEmail: resolvedPatientEmail,
      hospitalId,
      doctorId,
      doctorName,
      doctorSpecialty,
      hospitalName,
      consultationType,
      grossAmount: fee,
      commissionAmount: commissionAmountMinor / 100,
      currency: 'aed',
      status: 'PENDING',
      paymentFlow: 'PAYMENT_INTENT',
      policySnapshot,
      stripePaymentIntentId: paymentIntent.id,
      stripeConnectedAccountId: hospital.stripeAccountId,
    },
  });

  return res.status(201).json({
    success: true,
    data: {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      stripeAccountId: hospital.stripeAccountId,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
      appointmentId: appointment.id,
      amount: Number(fee),
      currency: 'AED',
      paymentFlow: 'PAYMENT_INTENT',
    },
  });
}

module.exports = { createCheckoutSession, createPaymentIntent };
