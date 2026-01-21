# EMR Adapters

Adapters for integrating with various Electronic Medical Record (EMR) systems.

## Supported EMRs

- **Cerner** - Cerner Millennium adapter
- **Epic** - Epic MyChart adapter
- **Custom EMRs** - Generic adapter pattern

## Responsibilities

- EMR-specific authentication
- Data mapping (internal ↔ EMR format)
- Patient data synchronization
- Appointment synchronization
- Medical record retrieval

## Architecture

Each EMR has its own adapter:
- `cerner-adapter/` - Cerner-specific implementation
- `epic-adapter/` - Epic-specific implementation
- `generic-adapter/` - Template for custom EMRs

## Common Interface

All adapters implement a common interface:

```typescript
interface EMRAdapter {
  authenticate(): Promise<void>;
  getPatient(emiratesId: string): Promise<Patient>;
  syncAppointment(appointment: Appointment): Promise<void>;
  getMedicalRecords(patientId: string): Promise<MedicalRecord[]>;
}
```

