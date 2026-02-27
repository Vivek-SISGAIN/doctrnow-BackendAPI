# Seed Data – Canonical IDs and Run Order

All services that seed data use **shared canonical IDs** so that profiles, appointments, consultations, and medical records line up. Use this when adding or changing seeds.

## Canonical IDs

| Entity | ID | Used by | Notes |
|--------|-----|---------|--------|
| **Auth – Doctor user** | `11111111-1111-1111-1111-111111111111` | auth-service, profile-service | Login: `doctor@doctornow.com` |
| **Auth – Patient user** | `22222222-2222-2222-2222-222222222222` | auth-service, profile-service | Login: `patient@doctornow.com` |
| **Profile – Doctor (entity)** | `00000000-0000-0000-0000-000000000001` | profile-service, appointment-service, consultation-service, medical-records-service | Same person as doctor user above |
| **Profile – Patient (entity)** | `00000000-0000-0000-0000-000000000101` | profile-service, appointment-service, consultation-service, medical-records-service | Same person as patient user above |
| **Appointments (fixed)** | `a1000000-0000-0000-0000-000000000001` … `008` | appointment-service (creates), consultation-service, medical-records-service (reference) | 8 sample appointments |
| **Consultations (fixed)** | `c1000000-0000-0000-0000-000000000001` … `005` | consultation-service (creates), medical-records-service (reference) | 5 sample consultations |

## Recommended seed order

Run seeds in this order so foreign references exist:

1. **auth-service** – `npm run seed` (users: doctor, patient, test patient)
2. **profile-service** – `npx prisma db seed` (specialties, patient with fixed id, doctor with fixed id)
3. **appointment-service** – `npm run seed` (slots for seed doctor, 8 appointments with fixed ids for seed patient)
4. **consultation-service** – `npm run seed` (consultations for those appointments, fixed consultation ids)
5. **medical-records-service** – `npm run seed` (prescriptions, lab reports, documents referencing those appointments/consultations)
6. **hospital-admin-service** – `npm run seed` (health services and packages; no cross-service IDs)

## Env overrides (optional)

- **appointment-service**: `SAMPLE_DOCTOR_ID`, `SEED_PATIENT_ID`, `ADDITIONAL_DOCTOR_IDS` (comma-separated) to create slots for more doctors.
- **consultation-service** / **medical-records-service**: `SAMPLE_DOCTOR_ID`, `SEED_PATIENT_ID` to match profile if you use different DBs or IDs.

## Result after seeding

- **Patient portal** (e.g. login `patient@doctornow.com`): “My Appointments” shows the 8 seed appointments; profile patient id is `00000000-0000-0000-0000-000000000101`.
- **Doctor portal** (e.g. login `doctor@doctornow.com`): Consultation history, lab reports, and prescriptions show data for profile doctor id `00000000-0000-0000-0000-000000000001`.
- **Slot selection**: Slots exist for the seed doctor (`00000000-0000-0000-0000-000000000001`). For other profile doctors, set `ADDITIONAL_DOCTOR_IDS` and re-run appointment-service seed.
