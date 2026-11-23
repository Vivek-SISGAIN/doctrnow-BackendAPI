# DoctorNow — DHA Submission: Internal Gaps Tracker and Code Traceability (INTERNAL — do not send to client)

Contents: 1) build items, 2) decisions/evidence, 3) security hygiene, 4) things not fully verified, 5) before-sending checklist, 6) code traceability (component → code → status).

Created 6 Nov 2026. Companion to the Compliance Matrix (DN-COMP-MATRIX-2026): **C-xx** = same ID as in the matrix. Tick a row when the code is merged AND the matrix status is updated before the next client submission.

Reference: DHA Standards for Telehealth Services ST-14 Issue 4 (effective 26 Nov 2025), UAE Federal Law 2/2019.

## 1. Build items (simplest way to close each)

| ✓ | ID | Gap | Simplest implementation | Where in code | Phase |
|---|---|---|---|---|---|
| ☐ | C-32 | Stripe Standard / Direct Charge not fully implemented | Finish and test per `DoctorNow_Stripe_Connect_Implementation_Plan.md`; then remove leftover settlement/transfer code (settlement controller, cron, routes, `recoverFromHospital`, `SettlementAdjustment` + transfer fields in schema, `SETTLEMENT_HOLD_HOURS`, Settlements.tsx pending/adjustments tabs). Set a statement descriptor policy. | payment-insurance-service; hospital-admin frontend | Before pilot |
| ☐ | C-31 | Refund/cancellation rules not final; no automatic refund | Adopt the FSD tiers (>24h full, 6-24h 50%, <6h none, patient no-show none, doctor unavailable full; configurable per hospital), then call `processRefund` from appointment cancellation / provider no-show. The import in `stripeConnect.controller.js` is currently unused. Publish the policy text in the patient app. | payment-insurance-service, appointment-service | Before pilot |
| ☐ | C-17/18 | Consent not persisted; privacy screen is local state and cites HIPAA/GDPR | Add a `Consent` table (patientId, type, version, text hash, acceptedAt, IP) in profile-service; enforce at first booking; replace HIPAA/GDPR wording with DHA/UAE wording (use ST-14 Appendix 4 sample consent form — NOT YET READ). | patient frontend `WebConsentScreen.tsx`; profile-service | Before pilot |
| ☐ | C-16 | Admin roles are password-only | Extend the existing OTP flow to HOSPITAL_ADMIN and SUPER_ADMIN logins. | auth-service `auth.service.ts` | Before pilot |
| ☐ | C-22 | Hard-delete routes for clinical records; no retention rule | Remove `DELETE` for prescriptions, documents, lab reports (or turn into soft delete with `deletedAt`, never purge < 25 years); block updates after signing. | medical-records-service routes/services | Before pilot |
| ☐ | C-26/27 | Controlled drugs not blocked; no MOHAP list | Reject `isControlled = true` at prescription creation; later load the MOHAP drug list as the catalogue. | medical-records-service `prescription.service.js` | Before pilot / production |
| ☐ | C-28 | Sick-leave limit (3 days/week) | Validation on sick-leave prescriptions/documents. | medical-records-service | Before pilot |
| ☐ | C-25 | Prescribing with expired licence | Check `licenseExpiry` of the doctor when issuing a prescription or starting a consultation. | profile-service, medical-records-service | Before pilot |
| ☐ | C-29 | No emergency notice | Static emergency banner (999/998 text) on booking and lobby screens; facility protocol document. | patient frontend | Before pilot |
| ☐ | C-20 | Arabic | Doctor languages already stored. Arabic UI is NOT in FSD and not required by DHA cl. 14.1.6 (consultation language) — do only if client asks. | patient/doctor frontends | Client option |
| ☐ | C-09/14 | Hosting is not Azure UAE North; prod compose references AWS ECR `ap-south-1` | Provision Azure (AKS, PG, Cosmos/Mongo, Redis, Blob, Key Vault, WAF); replace S3 SDK usage with Azure Blob (or S3-compatible endpoint in UAE) in profile, hospital-admin, medical-records, super-admin, video-chat. Remove AWS refs from compose. | infra/, docker-compose.prod.yml, services using S3 | Before production |
| ☐ | C-23 | Audit log has no integrity protection | Add append-only/WORM storage (FSD 10.2) — hash chain optional (`prevHash`, `hash`) on insert and block update/delete at DB role level; define retention; add export endpoint. | api-gateway `AuditLog.ts` | Before production |
| ☐ | C-15 | Emirates ID not validated | FSD 4.1: format 784-YYYY-XXXXXXX (15 digits), digits 4-7 = birth year, uniqueness; also family members. No authoritative (ICA/MPI) check. | profile-service `patient.service.js` | Before pilot |
| ☐ | C-21 | No diagnosis code picker | FSD 5.4: free text OR ICD-10 selection → optional ICD-10 picker only (no SNOMED / ICD-10-AM). | consultation-service + doctor frontend | Before pilot |
| ☐ | C-30 | NABIDH / EMR adapters | NOT in FSD and not DoctorNow's obligation: facility EMR submits to NABIDH. Do not build; scope per facility only if DHA/facility asks (change request). | — | Per facility |
| ☐ | C-33 | Insurance API is a mock | FSD scope = manual Hospital Admin co-payment workflow (FSD 4.6 option 3, Phase 2), NOT eClaimLink. Build that workflow; keep mock hidden until then. | api-gateway + payment-insurance insurance controllers; hospital-admin | Phase 2 |
| ☐ | C-05 | No support escalation matrix | Write a 1-page matrix (levels, response/resolution times). | process doc | Before production |
| ☐ | C-08 | KPI extracts | CSV export of appointments/access/quality metrics per facility. | hospital-admin service | Before production |
| ☐ | C-34 | Privacy notice, DSR, breach process | Draft with legal counsel. | policy docs | Before pilot |

## 2. Decisions / evidence needed (not code)

| ✓ | ID | Item | Owner |
|---|---|---|---|
| ☐ | C-12/13 | **Video provider (Agora):** UAE residency of media and TDRA approval unknown. Ask Agora; consider a UAE-resident/TDRA-approved provider. Also assess Firebase FCM, Twilio, SMTP2GO (prescription emails → secure link or UAE provider). Check Ministerial Decision 51/2021 exemption for telemedicine with counsel. | |
| ☐ | C-01 | DHA platform approval application (cl. 7.6.2) | |
| ☐ | C-02/03 | Dubai legal representative with trade licence; Business Technical Director | |
| ☐ | C-10/11 | Azure UAE North: confirm DESC CSP coverage, Tier 3, ISO 27001, HIPAA evidence; decide DoctorNow's own ISO 27001 route | |
| ☐ | C-07 | Facility agreements (cl. 6.3) | |
| ☐ | — | Legal confirmation that payment data to Stripe is non-health data; and on the Stripe/merchant-of-record regulatory position (v1.0 asserted SVF / fee-splitting claims — removed in v1.1) | |

## 3. Security hygiene found during the audit (fix regardless of DHA)

- ☐ `video-chat-service/.env.example` contains a MongoDB URI with credentials → rotate and remove.
- ☐ `appointment-service/.env` has `RABBITMQ_URL` with credentials and public IP 13.232.250.65 → check whether committed; rotate; remove unused `amqplib` dependency from appointment-service.
- ☐ Twilio runs in mock mode when `TWILIO_MOCK_MODE=true` — make sure production never sets it.
- ☐ Direct service-to-service calls (payment-insurance, hospital-admin) bypass the gateway signature path → move to signed internal calls.
- ☐ Gateway `hashUserId` in logging interceptor is a simple non-cryptographic hash (comment says replace in production).

## 4. Things I could not fully verify (check before relying on them)

- ST-14 clause numbers were read through a web-fetch tool (partly summarised). Open the PDF and confirm every clause cited in the matrix: 4.2.1, 4.2.2, 6.3, 6.5.2, 7.6.2–7.6.7, 7.7, 7.8, 7.9.1(e), 8.2.5, 8.2.7, 8.2.9, 8.4.1(j), 9.7, 9.9, 10.x, 11.6, 11.10, 12.4, 13.4, 13.6, 14.1.x, 14.4.1, 14.5.5, 17.12.x, 19.1.
- Not read: ST-14 Appendix 4 (sample consent), Appendix 5 (drug classes), Appendix 2 from scenario 5.
- Not read: NABIDH Authentication & Authorization policy and the two PDFs attached to DHA circular CIR-2025-00000101 (EMR/NABIDH/SSO, list of facilities mandated to integrate). These may add requirements (MFA, SSO, session rules).
- Azure UAE North DESC coverage: Microsoft Learn has a DESC CSP page; region coverage not confirmed.
- ADHICS (Abu Dhabi) applicability: not assumed; confirm only if serving Abu Dhabi facilities.

## 5. Before sending anything to the client

1. Re-run the check of each "Implemented" row in the matrix against the code on the day of sending.
2. Update statuses and the date in all three documents.
3. Have counsel read the Regulatory basis table and the third-party table.
4. Do not send any file from this internal list.

## 6. Code traceability (component → code → status)

Status key: **Built** = implemented in the codebase · **Mock** = code exists but simulated · **Planned** = not in code (drawn dashed-yellow in the dossier)

| Component shown in dossier | Where in code | Status | Note |
|---|---|---|---|
| API Gateway (NestJS): helmet, Throttler, JWT guard (RS256 via JWKS), RBAC, Redis token revocation, circuit breaker, proxy controllers, Agora token controller, FHIR controller, audit publisher | `doctrnow-BackendAPI` api-gateway | Built | Gateway forwards X-User-ID / X-User-Role / X-Tenant-ID headers; `x-internal-sig` (shared secret) protects internal endpoints only; some services call each other directly (see SYS-08) |
| Identity (auth-service): register/login, OTP 2FA (patient + doctor), lockout, JWKS, password reset | auth-service | Built | Admin roles are password-only → "second factor for admin roles" drawn Planned |
| Profile, Appointment (slot lock, BullMQ reminders 15/3/1 min), Consultation, Medical Records / e-Rx, Hospital Admin, Super Admin | respective services (own Postgres, Prisma) | Built | |
| Video & Chat | video-chat-service (MongoDB, Socket.io + Redis adapter) | Built | Media is Agora; backend only issues tokens. No cloud recording — only consent timestamps |
| Notification: RabbitMQ channel queues, OTP queue/retry, Twilio, SMTP2GO, FCM, Socket.io (RabbitMQ is used ONLY here) | notification-service | Built |
| Appointment reminders: BullMQ on Redis (RabbitMQ no longer used; `amqplib` dependency is leftover) | appointment-service | Built | Twilio runs in mock mode unless configured |
| Payment: Stripe Standard accounts, Direct Charges via Checkout Sessions, webhooks (platform + Connect), `ProcessedWebhookEvent`, verify-on-return, 2-min stuck-checkout cron, hourly stuck-refund scan, 15-min account poll | payment-insurance-service | **In progress** (not fully implemented; client docs say "target design") | Leftover settlement/transfer code from the old model still exists (cleanup not started) |
| Commission ledger + `CommissionInvoice` (UNPAID → PAYMENT_SUBMITTED → PAID, OVERDUE) | payment-insurance-service, hospital-admin | Built | VAT = 0; daily 23:00 cron |
| FHIR R4 access (Patient, Encounter, Observation, Condition, MedicationRequest, Practitioner) | payment-insurance-service FHIR module | Built (sandbox) | Cerner sandbox only |
| Insurance eligibility / claims | insurance controller | **Mock** | Dossier says "simulated"; real integration Planned |
| NABIDH, Riayati, other EMR adapters | adapter folders contain README only | Planned | |
| Audit trail → Mongo `AuditLog`, `/audit/logs` (SUPER_ADMIN, HOSPITAL_ADMIN) | gateway + services | Built | audit-compliance-service is a stub; immutable store / SIEM / reports Planned |
| Kafka | auth-service, `KAFKA_ENABLED` | Built (optional) | On when NODE_ENV=production (auth-service `KAFKA_ENABLED` logic); prod compose includes Kafka/Zookeeper |
| Object storage | AWS S3 SDK in profile, hospital-admin, medical-records, super-admin, video-chat | Built on S3 SDK | Dossier says "Azure Blob Storage" (Planned) → **code migration needed** |
| Azure hosting (AKS, Azure DB for PostgreSQL, Cosmos DB for Mongo, Azure Cache for Redis, Blob, Key Vault, Monitor, ACR, Front Door/App Gateway WAF, DDoS) | none (prod compose references AWS ECR `ap-south-1`) | Planned | Must be real before go-live to support UAE-residency claim |
| Patient mobile app | none | Planned | |


## 7. FSD alignment (added 6 Nov 2026) — see INTERNAL_FSD_Scope_Alignment.md

Matrix IDs were renumbered: old C-31 (EMR adapters) removed; old C-32..C-35 are now C-31..C-34. Client must approve in writing before pilot: (a) Direct Charge replaces FSD 7.5 payout module and the Platform Service Fee line; (b) sick-leave limit 3 days/week (DHA) vs FSD 1–7 days; (c) 25-year retention vs FSD 7 years; (d) Azure UAE North + S3→Blob migration (FSD allows AWS or Azure); (e) FSD refund tiers adopted as default. Put these in the cover email, not in the DHA documents.

## 8. Findings from the 6 Nov code re-verification (add to hygiene list)

- ☐ Hard-coded fallback internal secret `super_secret_internal_key_123` in `api-gateway/src/config/index.ts` and `custom-throttler.guard.ts` → remove the default; fail startup if INTERNAL_SERVICE_SECRET is unset.
- ☐ `settlementTransfer.cron.js` (daily 21:00) is still in payment-insurance-service although the Direct Charge model says DoctorNow holds no funds → disable/remove before pilot (part of C-32 cleanup).
- ☐ Kafka is enabled automatically when NODE_ENV=production (auth-service) → confirm a broker exists in the target deployment or set KAFKA_ENABLED=false explicitly.
- ☐ Services trust `x-user-id` / `x-user-role` headers from the caller → they must only be reachable from the gateway (private network) in the Azure deployment.
- ☐ Matrix v1.0 statuses now follow the three buckets. "Outside current scope": C-28 sick-leave limit (FSD allows 1-7 days; DHA 3/week), NABIDH/EMR adapters, eClaimLink, Arabic UI. Clause 25-year retention is wording-only ("configured as agreed").
