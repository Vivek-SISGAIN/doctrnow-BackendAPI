# Payment & Insurance Service

Handles payments, insurance claims, and refunds.

## Responsibilities

- Payment processing
- Insurance claim submission
- Copay calculation
- Refund processing
- Transaction history
- Payment gateway integration

## Database Schema

```sql
transactions (
  id UUID PK,
  appointment_id UUID,
  amount DECIMAL,
  status VARCHAR,
  gateway_ref VARCHAR
)

insurance_requests (
  id UUID PK,
  appointment_id UUID,
  emirates_id VARCHAR,
  status VARCHAR,
  copay_amount DECIMAL
)

refunds (
  id UUID PK,
  transaction_id UUID,
  amount DECIMAL,
  reason TEXT
)
```

## API Endpoints

### Payment & Insurance
- `POST /payments` - Process payment
- `GET /payments/:id` - Get payment details
- `POST /payments/:id/refund` - Process refund
- `POST /insurance/claims` - Submit insurance claim
- `GET /insurance/claims/:id` - Get claim status
- `GET /insurance/coverage/:emiratesId` - Check insurance coverage

### Cerner FHIR R4 Integration
- Complete API Guide for Frontend Developers: [FHIR_API_GUIDE.md](./FHIR_API_GUIDE.md)
- Interactive Swagger UI: `http://localhost:3006/api-docs`

#### FHIR Resource Endpoints:
- **Patient**: `GET /Patient`, `GET /Patient/:id`, `POST /Patient`, `PATCH /Patient/:id`
- **Observation (Vitals & Labs)**: `GET /Observation`, `GET /Observation/:id`, `POST /Observation`, `PUT /Observation/:id`
- **Condition (Diagnoses)**: `GET /Condition`, `GET /Condition/:id`, `POST /Condition`, `PUT /Condition/:id`
- **Encounter (Visits)**: `GET /Encounter`, `GET /Encounter/:id`, `POST /Encounter`, `PATCH /Encounter/:id`
- **MedicationRequest (Prescriptions)**: `GET /MedicationRequest`, `GET /MedicationRequest/:id`, `POST /MedicationRequest`, `PATCH /MedicationRequest/:id`
- **Practitioner (Doctors)**: `GET /Practitioner`, `GET /Practitioner/:id`, `POST /Practitioner`
- **Patient Full Summary Chart**: `GET /api/fhir/patient-summary/:id`
- **Sandbox Test Patients**: `GET /api/fhir/sandbox-patients`

## Events Published

- `PaymentSuccess`
- `PaymentFailed`
- `RefundProcessed`
- `InsuranceClaimSubmitted`

## Events Consumed

- `AppointmentBooked` (from Appointment Service)


