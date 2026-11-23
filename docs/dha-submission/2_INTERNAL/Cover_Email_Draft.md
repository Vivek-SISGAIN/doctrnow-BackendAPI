**Subject:** DoctorNow — Architecture documents for Dubai Health IT review (v1.1)

Dear [Name],

Please find the architecture documents for Dubai Health's IT verification of the DoctorNow platform:

1. **Architecture Specification v1.1** (Word and PDF) — how the platform is built, where data is held, security, payments and interoperability. It replaces the earlier version (DN-DHA-ARCH-2026-OFFICIAL); Annex B lists what changed.
2. **Architecture Diagram Dossier** (PDF, with editable draw.io file and PNG/SVG images) — 26 views covering the overall system, each module and the payment flows.
3. **Compliance Matrix** (Word and PDF) — each applicable DHA Telehealth Standards (ST-14, Issue 4) and Federal Law 2/2019 requirement, what is in the product today and what is planned.

Two points to note. First, everything not yet in the product is marked **Planned** (with its phase), **Organisational**, **Under assessment** or **Outside current scope**. Second, the Stripe payment implementation (Standard connected accounts with Direct Charges) is still being completed, so the payment views are marked as the target design.

For your approval (not for forwarding to DHA): to stay within the agreed FSD, the documents (1) keep Stripe Direct Charge with facility settlement and separate commission invoicing, which replaces the FSD hospital-payout module and changes the Platform Service Fee line; (2) apply the FSD refund tiers as the default refund policy; (3) leave the DHA 3-days-per-week sick-leave limit (the FSD allows 1-7 days), NABIDH/EMR adapters, eClaimLink integration and an Arabic interface outside the current scope; (4) state record retention as "configured as agreed" (DHA specifies 25 years, the FSD 7); and (5) target Azure UAE North, whereas the FSD allows AWS or Azure. Please confirm these in writing.

We would welcome DHA's feedback on the matrix, in particular on hosting evidence and the video-provider approval. Happy to walk the IT team through the documents.

Kind regards,
[Name]
