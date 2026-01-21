# Consultation Service

Manages video consultations, session tracking, and no-show records.

## Responsibilities

- Consultation session management
- Start/end consultation tracking
- No-show detection and recording
- Consultation history
- Session duration tracking

## Database Schema

```sql
consultations (
  id UUID PK,
  appointment_id UUID,
  started_at TIMESTAMP,
  ended_at TIMESTAMP,
  status VARCHAR
)

no_show_records (
  consultation_id UUID,
  reason TEXT
)
```

## API Endpoints

- `POST /consultations/:appointmentId/start` - Start consultation
- `POST /consultations/:id/end` - End consultation
- `GET /consultations/:id` - Get consultation details
- `POST /consultations/:id/no-show` - Record no-show
- `GET /consultations/history/:patientId` - Get patient history
- `GET /consultations/history/doctor/:doctorId` - Get doctor history

## Events Published

- `ConsultationStarted`
- `ConsultationCompleted`
- `NoShowRecorded`

## Events Consumed

- `AppointmentBooked` (from Appointment Service)
- `AppointmentConfirmed` (from Appointment Service)

