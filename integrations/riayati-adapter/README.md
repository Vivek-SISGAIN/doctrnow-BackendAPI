# Riayati FHIR Adapter

Adapter for integrating with Riayati (NUMR - National Unified Medical Record) using FHIR standards.

## Responsibilities

- Convert internal data models to FHIR resources
- Submit patient data to Riayati
- Retrieve patient data from Riayati
- Handle FHIR authentication
- Map FHIR responses to internal models

## FHIR Resources Used

- `Patient` - Patient demographics
- `Encounter` - Consultation records
- `MedicationRequest` - Prescriptions
- `Observation` - Clinical observations
- `DocumentReference` - Medical documents

## API Endpoints

- `POST /riayati/patients` - Submit patient to Riayati
- `GET /riayati/patients/:emiratesId` - Retrieve patient from Riayati
- `POST /riayati/encounters` - Submit consultation record
- `POST /riayati/medications` - Submit prescription

## Configuration

- Riayati FHIR endpoint URL
- Client credentials (OAuth2)
- Certificate for mTLS (if required)

