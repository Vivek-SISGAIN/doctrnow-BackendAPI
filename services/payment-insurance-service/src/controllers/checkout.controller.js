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

  const { doctorId, hospitalId, slotId, consultationType, familyMemberId, reason, notes } = req.body;
  if (!doctorId || !hospitalId || !slotId || !consultationType) {
    return res.status(400).json({ success: false, message: 'doctorId, hospitalId, slotId, and consultationType are required.' });
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
    await axios.post(`${APPOINTMENT_URL}/api/slots/${slotId}/lock`, { lockedBy: patientId, expiresInMinutes: 5 });
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

  // 5. Create the PENDING appointment. Reuses the existing public create
  //    endpoint on purpose — omitting status/paymentStatus from the body
  //    makes it default to PENDING/PENDING (see appointment.service.js
  //    create()), and this endpoint already has the slot-conflict +
  //    lock-ownership checks we need, so there's no reason to duplicate them.
  let appointment;
  try {
    const r = await axios.post(`${APPOINTMENT_URL}/api/appointments`, {
      patientId, doctorId, hospitalId, slotId, consultationType, familyMemberId, reason, notes,
    });
    appointment = r.data?.data || r.data;
  } catch (err) {
    console.error('[checkout] Failed to create pending appointment:', err?.response?.data || err.message);
    return releaseLockAndFail(err?.response?.status === 409 ? 409 : 502, err?.response?.data?.message || 'Could not create the appointment.');
  }

  // 6. Create the Stripe Checkout Session on the platform account
  //    (Separate Charges & Transfers). The hospital's share will be moved
  //    later via Transfer (1.9).
  let session;
  try {
    session = await stripe.checkout.sessions.create({
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
      payment_intent_data: {
        // Ties this PaymentIntent to the Transfer(s) that will move the
        // hospital's share out of the platform balance later (1.9). Stripe's
        // recommended pattern for Separate Charges & Transfers.
        transfer_group: appointment.id,
      },
      metadata: { appointmentId: appointment.id, patientId, hospitalId, doctorId, slotId },
      // Append appointmentId to the configured success URL per-session, so the
      // patient frontend knows which appointment to poll for confirmation
      // without needing a new "look up by session id" endpoint. Assumes
      // PATIENT_APP_CHECKOUT_SUCCESS_URL already ends in a query string
      // (it does — see .env) so this is a safe `&` append.
      success_url: `${process.env.PATIENT_APP_CHECKOUT_SUCCESS_URL}&appointmentId=${appointment.id}`,
      cancel_url: process.env.PATIENT_APP_CHECKOUT_CANCEL_URL,
      expires_at: Math.floor(Date.now() / 1000) + 35 * 60,
    });
    // no { stripeAccount: hospital.stripeAccountId } — the charge is created on
    // the platform account. The hospital is only reachable through Stripe now
    // via its own Transfer, built in 1.9.
  } catch (err) {
    console.error('[checkout] Stripe session creation failed:', err.message);
    // The appointment already exists as PENDING — cancel it and free the slot
    // rather than leaving an orphaned PENDING appointment with no checkout.
    await axios.patch(`${APPOINTMENT_URL}/api/appointments/internal/${appointment.id}/payment-outcome`,
      { outcome: 'FAILED' }, { headers: internalHeaders() }).catch(() => {});
    return res.status(502).json({ success: false, message: 'Could not create the checkout session.' });
  }

  // 7. Ledger row.
  await prisma.transaction.create({
    data: {
      appointmentId: appointment.id,
      patientId,
      hospitalId,
      doctorId,
      grossAmount: fee,
      commissionAmount: commissionAmountMinor / 100,
      currency: 'aed',
      status: 'PENDING',
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
      // stripeConnectedAccountId is the hospital this transaction is destined
      // for, NOT where the charge lives — the charge is on the platform account
      // now (Separate Charges & Transfers). It's what 1.9's Transfer step will
      // read to know which connected account to pay.
      stripeConnectedAccountId: hospital.stripeAccountId,
    },
  });

  return res.status(201).json({
    success: true,
    data: { checkoutUrl: session.url, appointmentId: appointment.id },
  });
}

module.exports = { createCheckoutSession };
