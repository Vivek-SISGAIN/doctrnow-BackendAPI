# Appointment & Scheduling Service

Manages doctor availability, slots, and appointment bookings.

## Responsibilities

- Slot management (create, update, delete, bulk create)
- Appointment booking
- Slot locking (prevent double-booking during booking process)
- Appointment status management (pending, confirmed, completed, cancelled, no-show)
- Appointment rescheduling
- Availability queries

## Database Schema

The service uses Prisma with the following models:

- **Slot**: Doctor availability slots
- **Appointment**: Patient appointments linked to slots
- **SlotLock**: Temporary locks to prevent double-booking

## API Endpoints

### Appointments

- `GET /api/appointments` - Get all appointments with filtering and pagination
- `GET /api/appointments/:id` - Get appointment by ID
- `POST /api/appointments` - Create new appointment
- `PATCH /api/appointments/:id` - Update appointment
- `POST /api/appointments/:id/cancel` - Cancel appointment
- `POST /api/appointments/:id/reschedule` - Reschedule appointment
- `POST /api/appointments/:id/confirm` - Confirm appointment
- `POST /api/appointments/:id/complete` - Mark appointment as completed
- `POST /api/appointments/:id/no-show` - Mark appointment as no-show

### Slots

- `GET /api/slots/available` - Get available slots for a doctor
- `GET /api/slots/doctor/:doctorId` - Get all slots for a doctor
- `GET /api/slots/:id` - Get slot by ID
- `POST /api/slots` - Create a new slot
- `POST /api/slots/bulk` - Create multiple slots at once
- `PATCH /api/slots/:id` - Update slot
- `DELETE /api/slots/:id` - Delete slot
- `POST /api/slots/:id/lock` - Lock a slot (prevent double-booking)
- `POST /api/slots/:id/unlock` - Unlock a slot

## Query Parameters

### Appointments
- `patientId` - Filter by patient ID
- `doctorId` - Filter by doctor ID
- `status` - Filter by status (PENDING, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW)
- `paymentStatus` - Filter by payment status (PENDING, PAID, FAILED, REFUNDED)
- `consultationType` - Filter by type (VIDEO, AUDIO, CHAT)
- `startDate` - Filter appointments from this date
- `endDate` - Filter appointments until this date
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

### Slots (Available)
- `doctorId` - Doctor ID (required)
- `startDate` - Start date for search (required)
- `endDate` - End date for search (required)

The API returns only **future** slots (startTime ≥ now) and deduplicates by (doctorId, startTime). The database enforces `UNIQUE(doctorId, startTime)` on slots to prevent duplicate slot creation.

## Events Published

- `SlotCreated`
- `AppointmentBooked`
- `AppointmentCancelled`
- `AppointmentRescheduled`
- `AppointmentConfirmed`
- `AppointmentCompleted`

## Events Consumed

- `PaymentSuccess` (from Payment Service)
- `PaymentFailed` (from Payment Service)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables (copy `.env.example` to `.env`):
```bash
PORT=3003
DATABASE_URL=postgresql://user:password@localhost:5432/doctornow_appointments
```

3. Generate Prisma client:
```bash
npm run prisma:generate
```

4. Run migrations:
```bash
npm run prisma:migrate
```
If migration `20260211100000_slot_unique_doctor_starttime` fails with a duplicate-key error, run the duplicate-cleanup script first (then re-run migrate):
```bash
psql $DATABASE_URL -f prisma/scripts/remove-duplicate-slots.sql
```

5. **Seed the database (creates slots for the sample doctor):**
```bash
npm run seed
```
This creates 14 days of available slots (9 AM–5 PM, every 30 min) for:
- `SAMPLE_DOCTOR_ID` (default `00000000-0000-0000-0000-000000000001`)
- Any IDs in `ADDITIONAL_DOCTOR_IDS` (comma-separated)

If the patient portal shows no slots, the doctor you selected likely has a different ID (e.g. from profile-service). Either set that ID and re-seed:
```bash
# In .env (appointment-service)
ADDITIONAL_DOCTOR_IDS=5cd73971-0faa-4b3f-81b3-ec7aeed91bf3
```
Then run `npm run seed` again. Or set `SAMPLE_DOCTOR_ID` to that doctor's UUID so all seeded slots are for that doctor.

6. Start the service:
   ```bash
   npm start
   # or for development
   npm run dev
   ```

## Integration with API Gateway

The service is integrated with the API Gateway at `/api/v1/appointments`. The gateway routes:
- `/api/v1/appointments/*` → `/api/appointments/*`
- `/api/v1/appointments/slots/*` → `/api/slots/*`

## Frontend Integration

The appointment APIs are integrated in the doctor portal at `src/lib/api.ts`:
- `appointmentApi` - All appointment operations
- `slotApi` - All slot operations

Example usage:
```typescript
import { appointmentApi, slotApi } from '@/lib/api';

// Get appointments for a doctor
const appointments = await appointmentApi.getAll({ doctorId: 'doctor-id' });

// Get available slots
const slots = await slotApi.getAvailable({
  doctorId: 'doctor-id',
  startDate: '2024-01-01',
  endDate: '2024-01-31'
});// Create appointment
const appointment = await appointmentApi.create({
  patientId: 'patient-id',
  doctorId: 'doctor-id',
  slotId: 'slot-id',
  consultationType: 'VIDEO'
});
```
