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

- `POST /payments` - Process payment
- `GET /payments/:id` - Get payment details
- `POST /payments/:id/refund` - Process refund
- `POST /insurance/claims` - Submit insurance claim
- `GET /insurance/claims/:id` - Get claim status
- `GET /insurance/coverage/:emiratesId` - Check insurance coverage

## Events Published

- `PaymentSuccess`
- `PaymentFailed`
- `RefundProcessed`
- `InsuranceClaimSubmitted`

## Events Consumed

- `AppointmentBooked` (from Appointment Service)

