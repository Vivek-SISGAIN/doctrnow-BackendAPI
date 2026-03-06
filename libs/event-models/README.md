# Event Models Library

Shared domain event definitions for event-driven communication.

## Event Types

### Authentication Events
- `UserRegistered`
- `UserLoggedIn`
- `UserLoggedOut`
- `PasswordResetRequested`

### Appointment Events
- `SlotCreated`
- `AppointmentBooked`
- `AppointmentCancelled`
- `AppointmentConfirmed`

### Consultation Events
- `ConsultationStarted`
- `ConsultationCompleted`
- `NoShowRecorded`

### Payment Events
- `PaymentSuccess`
- `PaymentFailed`
- `RefundProcessed`
- `InsuranceClaimSubmitted`

### Medical Records Events
- `PrescriptionGenerated`
- `DocumentUploaded`

### Profile Events
- `PatientProfileUpdated`
- `DoctorProfileUpdated`
- `FamilyMemberAdded`

## Usage

```typescript
import { AppointmentBookedEvent } from '@doctornow/event-models';

const event: AppointmentBookedEvent = {
  eventType: 'AppointmentBooked',
  appointmentId: 'uuid',
  patientId: 'uuid',
  doctorId: 'uuid',
  slotId: 'uuid',
  timestamp: new Date(),
};
```

