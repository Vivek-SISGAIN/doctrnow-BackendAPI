# Hospital Admin Service

Manages hospital-specific operations and administration.

## Responsibilities

- Hospital profile management
- Doctor management (approval, assignment)
- Department management
- Hospital-specific settings
- Reporting and analytics
- Hospital user management

## Database Schema

```sql
hospitals (
  id UUID PK,
  name VARCHAR,
  license_number VARCHAR,
  address TEXT,
  contact_info JSONB
)

hospital_doctors (
  hospital_id UUID,
  doctor_id UUID,
  department VARCHAR,
  status VARCHAR
)

departments (
  id UUID PK,
  hospital_id UUID,
  name VARCHAR,
  specialty VARCHAR
)
```

## API Endpoints

- `GET /hospitals/:id` - Get hospital details
- `PUT /hospitals/:id` - Update hospital
- `GET /hospitals/:id/doctors` - List hospital doctors
- `POST /hospitals/:id/doctors` - Add doctor to hospital
- `GET /hospitals/:id/departments` - List departments
- `GET /hospitals/:id/analytics` - Get hospital analytics

## Events Published

- `DoctorAssignedToHospital`
- `HospitalSettingsUpdated`

