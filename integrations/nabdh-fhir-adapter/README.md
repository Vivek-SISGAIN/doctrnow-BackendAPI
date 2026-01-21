# NABDH FHIR Adapter

Adapter for integrating with NABDH (Dubai Health Information Exchange) using FHIR standards.

## Responsibilities

- Convert internal data models to FHIR resources
- Submit patient data to NABDH
- Retrieve patient data from NABDH
- Handle FHIR authentication
- Map FHIR responses to internal models

## FHIR Resources Used

- `Patient` - Patient demographics
- `Encounter` - Consultation records
- `MedicationRequest` - Prescriptions
- `Observation` - Clinical observations
- `DocumentReference` - Medical documents

## API Endpoints

- `POST /nabdh/patients` - Submit patient to NABDH
- `GET /nabdh/patients/:emiratesId` - Retrieve patient from NABDH
- `POST /nabdh/encounters` - Submit consultation record
- `POST /nabdh/medications` - Submit prescription

## Configuration

- NABDH FHIR endpoint URL
- Client credentials (OAuth2)
- Certificate for mTLS (if required)

