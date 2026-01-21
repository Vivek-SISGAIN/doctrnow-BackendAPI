# Appointment & Scheduling Service

Manages doctor availability, slots, and appointment bookings.

## Responsibilities

- Slot management (create, update, delete)
- Appointment booking
- Slot locking (prevent double-booking)
- Appointment status management
- Availability queries

## Database Schema

```sql
slots (
  id UUID PK,
  doctor_id UUID,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  status VARCHAR
)

appointments (
  id UUID PK,
  patient_id UUID,
  doctor_id UUID,
  slot_id UUID,
  status VARCHAR,
  payment_status VARCHAR
)

slot_locks (
  slot_id UUID PK,
  expires_at TIMESTAMP
)
```

## API Endpoints

- `GET /appointments/slots` - Get available slots
- `POST /appointments/slots` - Create slot (doctor/admin)
- `POST /appointments` - Book appointment
- `GET /appointments/:id` - Get appointment details
- `PUT /appointments/:id` - Update appointment
- `POST /appointments/:id/cancel` - Cancel appointment

## Events Published

- `SlotCreated`
- `AppointmentBooked`
- `AppointmentCancelled`
- `AppointmentConfirmed`

## Events Consumed

- `PaymentSuccess` (from Payment Service)
- `PaymentFailed` (from Payment Service)

