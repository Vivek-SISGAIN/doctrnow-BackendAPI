# Stripe Connect Simple Payments Proposal

## Goal

Support the client's preferred commercial model:

- Patient pays inside DoctrNow.
- Funds go directly to the hospital's Stripe connected account.
- DoctrNow keeps a simple platform commission.
- Reconciliation stays simple.
- Weekly commission reporting and collection remain possible without building a complex hold/release ledger first.

## What the current codebase already gives us

- Every appointment already stores `hospitalId`, so each booking is tied to a hospital.
- Appointment confirmation already depends on `paymentStatus`.
- The API gateway already reserves `/api/v1/payments` for a payment service.
- Super admin already stores hospital finance/bank configuration.
- Doctor and hospital profiles already contain revenue-share style fields.

Relevant code:

- `services/appointment-service/prisma/schema.prisma`
- `services/appointment-service/src/service/appointment.service.js`
- `services/super-admin-service/prisma/schema.prisma`
- `services/super-admin-service/src/services/finance.service.js`
- `services/profile-service/prisma/schema.prisma`
- `DOCTOR_NOW_PATIENT_FRONTEND/src/pages/WebPaymentOptionsScreen.tsx`
- `DOCTOR_NOW_PATIENT_FRONTEND/src/pages/WebPaymentConfirmationScreen.tsx`

## Recommended Stripe model

Use **Stripe Connect destination charges with `application_fee_amount`**.

Why this fits best:

- Patient checks out on DoctrNow.
- Each hospital receives money into its own Stripe connected account.
- DoctrNow automatically receives its commission as the Stripe application fee.
- No custom payout engine is needed.
- Reporting stays easy because every payment is linked to:
  - appointment
  - hospital
  - patient
  - Stripe payment intent / checkout session
  - platform fee
  - hospital gross/net

## Why not the other models

### Not separate charges and transfers

Avoid for phase 1 because:

- Money lands on the platform first.
- The platform must actively transfer money out later.
- Refunds, disputes, and negative balance handling become the platform's burden.
- This is closer to the complex hold/release/reconciliation flow the client wants to avoid.

### Not direct charges for phase 1

Direct charges are possible, but less convenient for platform-wide reporting because the charge objects live on the connected account. That makes central reconciliation and support tooling harder than necessary.

## Recommended business flow

### 1. Hospital onboarding

For each hospital:

- Create a Stripe connected account.
- Use Stripe-hosted onboarding so the hospital completes KYC and payout setup.
- Save:
  - `stripeAccountId`
  - onboarding status
  - charges enabled
  - payouts enabled
  - default currency

### 2. Booking and payment

Patient flow:

1. Patient selects doctor and slot.
2. Backend creates a provisional appointment with `paymentStatus = PENDING`.
3. Payment service creates a Stripe Checkout Session for that appointment.
4. Session is created with:
   - hospital connected account as destination
   - `application_fee_amount` as DoctrNow commission
   - metadata for `appointmentId`, `hospitalId`, `doctorId`, `patientId`
5. Patient completes checkout.
6. Stripe webhook marks payment successful.
7. Payment service updates appointment to:
   - `paymentStatus = PAID`
   - `status = CONFIRMED`

### 3. Refunds

For cancellations:

- Refund from the same Stripe payment.
- If commission should also be returned, refund the application fee too.
- Update local transaction + refund tables.
- Update appointment status and payment status consistently.

### 4. Weekly reconciliation

Generate a weekly report per hospital with:

- appointment count
- gross collected
- Stripe fee
- DoctrNow commission
- hospital net
- refunds
- disputed payments
- failed payments

This can be generated from local transaction records and cross-checked against Stripe balance transactions.

## Required product changes

### Patient frontend

Current patient flow does not perform a real payment. It only chooses a method and then creates the appointment directly.

Replace:

- fake "Pay Now" redirect flow in `WebPaymentOptionsScreen.tsx`
- appointment creation inside `WebPaymentConfirmationScreen.tsx`

With:

1. Call backend `POST /payments/checkout-session`
2. Redirect patient to Stripe Checkout
3. On success page, load appointment/payment status from backend

### Backend payment service

The current `payment-insurance-service` only contains a schema/README scaffold. It should become the real Stripe integration service.

Add:

- `POST /api/payments/checkout-session`
- `POST /api/payments/webhooks/stripe`
- `GET /api/payments/appointments/:appointmentId`
- `POST /api/payments/:paymentId/refund`
- `POST /api/payments/connect/onboard`
- `GET /api/payments/connect/:hospitalId/status`
- `GET /api/payments/reports/weekly`

## Recommended schema additions

### Super admin / hospital data

Add Stripe fields against hospital finance configuration:

- `stripeAccountId`
- `stripeOnboardingStatus`
- `stripeChargesEnabled`
- `stripePayoutsEnabled`
- `stripeDetailsSubmitted`
- `commissionType` (`PERCENTAGE` or `FIXED`)
- `commissionValue`

### Payment service tables

Extend the payment schema beyond the current draft:

- `transactions`
  - `hospital_id`
  - `doctor_id`
  - `checkout_session_id`
  - `payment_intent_id`
  - `connected_account_id`
  - `application_fee_amount`
  - `stripe_fee_amount`
  - `hospital_gross_amount`
  - `hospital_net_amount`
  - `status`
  - `raw_webhook_event_id`

- `refunds`
  - `refund_id`
  - `refund_application_fee`
  - `connected_account_id`

- `weekly_reconciliation_reports`
  - `hospital_id`
  - `week_start`
  - `week_end`
  - `gross_amount`
  - `platform_commission`
  - `stripe_fees`
  - `refunds`
  - `net_to_hospital`
  - `status`

## Implementation notes for this codebase

### Appointment ownership

Use `appointment.hospitalId` as the source of truth for which Stripe connected account receives funds.

### Commission source

For phase 1, use hospital-level commission settings from super admin finance config. Do not start with doctor-level split logic in the payment path unless the client explicitly wants it now.

### Webhook-first confirmation

Do not confirm appointments from the frontend callback URL alone.

Use Stripe webhook events as the source of truth for:

- payment success
- payment failure
- refund completion
- dispute creation

### Idempotency

Use idempotency keys for:

- checkout session creation
- webhook processing
- refund creation

## Best phase breakdown

### Phase 1

- Stripe Connect onboarding for hospitals
- Stripe Checkout for patient payments
- Destination charge with application fee
- Webhook-based appointment confirmation
- Simple weekly reconciliation export

### Phase 2

- Insurance + co-pay integration
- Partial refunds and policy rules
- Hospital finance dashboard
- Dispute workflow
- Automated payout/recovery analytics

## Final recommendation

For this project and this client requirement, the best fit is:

**DoctrNow as Stripe Connect platform + hospital connected accounts + destination charges + application fee commission.**

This gives the client the simplest operational model:

- patient pays in DoctrNow
- money reaches the hospital account directly
- DoctrNow keeps its commission automatically
- weekly reconciliation is simple
- no custom hold/release engine is required in phase 1

## Stripe docs used for this proposal

- https://docs.stripe.com/connect/destination-charges
- https://docs.stripe.com/connect/direct-charges
- https://docs.stripe.com/connect/separate-charges-and-transfers
- https://docs.stripe.com/connect/connect-onboarding
- https://docs.stripe.com/refunds
