# Prescription & Medical Records Service

Manages prescriptions, medical documents, and patient records.

## Responsibilities

- Prescription generation
- Prescription history
- Medical document storage
- Document access control
- FHIR compliance for interoperability

## Database Schema

```sql
prescriptions (
  id UUID PK,
  consultation_id UUID,
  doctor_id UUID,
  created_at TIMESTAMP
)

prescription_items (
  id UUID PK,
  prescription_id UUID,
  medicine_name VARCHAR,
  dosage VARCHAR
)

documents (
  id UUID PK,
  owner_id UUID,
  file_path TEXT,
  type VARCHAR
)
```

## API Endpoints

- `POST /prescriptions` - Create prescription
- `GET /prescriptions/:id` - Get prescription
- `GET /prescriptions/patient/:patientId` - Get patient prescriptions
- `POST /documents` - Upload document
- `GET /documents/:id` - Get document
- `GET /documents/patient/:patientId` - List patient documents

## Events Published

- `PrescriptionGenerated`
- `DocumentUploaded`

## Events Consumed

- `ConsultationCompleted` (from Consultation Service)

## Integrations

- NABDH FHIR adapter
- Riayati FHIR adapter

