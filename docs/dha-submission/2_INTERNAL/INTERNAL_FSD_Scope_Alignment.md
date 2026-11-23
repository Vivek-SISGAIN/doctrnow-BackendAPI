# DoctorNow — FSD vs Submission Documents: Scope Alignment (INTERNAL, not for the client)

FSD: `DoctorNow_Teleconsultation_FSD_Complete (2).pdf` (103 pp). Compared against Architecture Specification v1.1, Compliance Matrix v1.0, Dossier. Date: 6 Nov 2026.
Rule applied: our documents may only commit to (a) what the FSD requires, or (b) what DHA law makes mandatory. Anything else is extra work and must either be removed or raised as a change request.

## A. Where our documents CONTRADICT the FSD (need client sign-off, not silent change)

| # | FSD says | Our documents say | Impact |
|---|---|---|---|
| A1 | §7.5: platform collects payment; Super Admin runs **hospital payouts** (hospital share, commission deducted, net payable, payout schedule, minimum threshold, disputes). §4.6: patient sees a **Platform Service Fee** line. | Stripe Standard + Direct Charge: facility is merchant of record, DoctorNow holds no funds, no payouts, commission invoiced B2B. | Deliberate model change (Stripe-confirmed 10 Sep 2026). It REMOVES FSD payout work but changes FSD behaviour. Client must approve in writing. Decide what happens to "Platform Service Fee" line (can still be shown, but it settles to the facility). |
| A2 | §7.5: refunds go to a **Super Admin queue** (approve/reject/process); refund tiers >24h full / 6–24h 50% / <6h none / patient no-show none / doctor no-show full + compensation; configurable per hospital. | "Refund rules follow the policy agreed with each facility… being agreed" (spec 6.2, matrix C-32). Refunds issued by facility or platform admin. | The policy is ALREADY defined in the FSD. Adopt FSD tiers as the default; stop describing it as open. Approval actor needs confirming under Direct Charge. |
| A3 | §5.4 medical certificate: rest days **1–7**. | Matrix C-28 / spec §9: sick leave limited to **3 days/week** (DHA ST-14 cl. 17.12.9). | FSD conflicts with DHA rule. Keep DHA rule (it is law), tell client it is a deliberate deviation. |
| A4 | §4.6 insurance: **manual** verification by Hospital Admin via EHR/insurance portal, then co-pay payment. | Matrix C-34 / spec 6.3: live eClaimLink eligibility and claims "Planned". | eClaimLink is NOT in the FSD → extra work. Replace with: manual co-payment workflow (FSD Phase 2). Code today = mock insurance controller only. |
| A5 | §10: data retention **7 years**. | 25 years (DHA ST-14 cl. 11.10). | DHA stricter → we cannot write 7 in a DHA document. Cost is low (remove hard deletes + retention rule). Tell client it is a regulatory addition. |

## B. Our commitments that are EXTRA (not in FSD, not clearly mandatory) — recommend removing or reducing

| # | Item | FSD position | Recommendation |
|---|---|---|---|
| B1 | NABIDH adapter, EMR adapters (Epic/TrakCare), schedule sync, Riayati, "FHIR" as an integration commitment | FSD has zero mentions of NABIDH/FHIR/HL7/Malaffi/Riayati. | Do not commit. State: "Integration with facility EMR / NABIDH is outside the current release and will be scoped per facility or if DHA requires." Existing read-only FHIR sandbox endpoints can stay as "Implemented". |
| B2 | Azure UAE North as hard target + migrate S3 SDK → Azure Blob (5 services) | FSD: "AWS or Azure", no UAE-region requirement. | Biggest extra-work item. Options: keep Azure (full migration), or choose AWS UAE region (code stays on S3; only compose/ECR region changes) — DESC/DHA evidence for AWS UAE region must be verified first. Client/DHA decision. |
| B3 | Emirates ID verification against authoritative source (ICA/MPI) | FSD §4.1: **format validation + DOB-year cross-check + uniqueness** only. | Commit only to FSD validation. Drop "authoritative verification". NOTE: code has no 784 format validator today → FSD gap to build. |
| B4 | ICD-10-AM + SNOMED CT structured coding | FSD §5.4: "Free text **or ICD-10 code selection**". | Reduce to optional ICD-10 selection; drop SNOMED and "AM". |
| B5 | Full Arabic UI (matrix C-20) | FSD: multi-language *support*; Arabic = voice search + doctor languages; DHA cl. 14.1.6 is about consultation language availability (doctor language profile exists in code). | Re-state C-20 as: doctors declare Arabic/English; Arabic UI only if client requires. Verify cl. 14.1.6 wording once more. |
| B6 | Audit-log hash chain, DESC/ISO 27001/HIPAA evidence, DoctorNow's own ISO route | FSD §10.2: immutable (WORM) log storage, 7-yr retention — hash chain is one way to meet it; HIPAA/ISO are hosting-provider properties. | Keep "immutable audit log" (FSD) but do not name the mechanism; ISO route = organisational, not build. |
| B7 | Quarterly KPI extract for DHA (C-08) | FSD has analytics + export (Phase 3). | Reword as "reports/export from FSD analytics"; no separate build. |
| B8 | Replace HIPAA/GDPR wording with DHA/UAE wording in privacy screen (tracker C-17/18) | FSD itself cites HIPAA/GDPR/PDPL. | Drop; keep FSD wording, add UAE/DHA reference only. |

## C. Items that are consistent with FSD (keep)

Admin MFA (FSD: mandatory for admins) · persisted consent & data-subject rights · audit logging · prescription lock/versioning · UAE medication DB + monthly sync + interaction checks (matrix C-27 is FSD scope) · doctor licence check · controlled-substance "special handling" (FSD) → blocking is a small DHA-driven step · refund automation · emergency banner is trivial · DR/backup/pen-test (FSD §10) · mobile apps (FSD Phase 1).

## D. FSD features NOT built in code (FSD obligations, unrelated to what we send to DHA)

Pay Later flow, insurance co-pay workflow (only mock), Emirates ID format/DOB validation, family-member Emirates ID, session limits (max 2) and 30-min auto logout, password expiry/history, Google/Apple sign-in, optional recording, AI features (voice search partly), health services module, WCAG, 80% test coverage. Review separately against the contract/phase plan.

## E. How to handle in the documents

1. DHA-facing documents (spec, matrix, dossier): state only what is built, what the FSD requires, and DHA-mandatory items. Remove/soften B1–B8 so we never "promise DHA" extra scope.
2. Client cover email: add a short "Scope notes" paragraph listing A1–A5 (and B2) for written approval. Do NOT put FSD/commercial notes inside the DHA documents.
3. Keep this file internal.

## F. Result applied on 6 Nov 2026 (final bucket rule)

1. Built in code -> described exactly as built (each claim re-checked against the code on 6 Nov; corrections: internal-secret wording, Kafka on in production profile).
2. Not built but in FSD -> "Planned" with phase.
3. Not built, not in FSD -> "Outside current scope": sick-leave limit (C-28), NABIDH/EMR adapters, eClaimLink, Arabic UI. Retention period is "configured as agreed" (DHA 25y vs FSD 7y). Hosting stays Azure UAE North as the target (FSD Phase 1 requires cloud setup; region and Blob migration are our choice).
4. ISO/DESC/HIPAA evidence, escalation matrix -> "Organisational".
Small DHA additions kept as Planned because the work is trivial: emergency banner (C-29), licence-expiry check (C-25), controlled-drug block (C-26).
