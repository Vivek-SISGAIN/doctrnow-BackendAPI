# User & Profile Service

Manages patient and doctor profiles, including family members.

## Responsibilities

- Patient profile management
- Doctor profile management
- Family member management
- Profile updates and validation
- Emirates ID verification

## Database Schema

```sql
patients (
  id UUID PK,
  user_id UUID,
  emirates_id VARCHAR UNIQUE,
  dob DATE,
  gender VARCHAR,
  nationality VARCHAR
)

family_members (
  id UUID PK,
  patient_id UUID,
  emirates_id VARCHAR UNIQUE,
  dob DATE,
  relation VARCHAR
)

doctors (
  id UUID PK,
  name VARCHAR,
  dha_license VARCHAR,
  specialty VARCHAR,
  approved BOOLEAN
)
```

## API Endpoints

- `GET /profile/patient/:id` - Get patient profile
- `PUT /profile/patient/:id` - Update patient profile
- `GET /profile/doctor/:id` - Get doctor profile
- `PUT /profile/doctor/:id` - Update doctor profile
- `POST /profile/family` - Add family member
- `GET /profile/family/:patientId` - Get family members

## Events Published

- `PatientProfileUpdated`
- `DoctorProfileUpdated`
- `FamilyMemberAdded`

