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

## Database setup and seed

1. **Create PostgreSQL database** (e.g. `profile_db`). Can be the same server as auth-service with a different database name.
2. **Set `.env`** (or env vars) with:
   ```bash
   DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/profile_db
   ```
3. **Run migrations and seed** (from `services/profile-service`):
   ```bash
   npm run db:setup
   ```
   This runs `prisma generate`, `prisma migrate deploy`, and `prisma db seed`.

   Or step by step:
   ```bash
   npm run db:generate   # Generate Prisma client
   npm run db:migrate    # Apply migrations
   npm run db:seed       # Seed patient + doctor profiles
   ```
4. **Seed data** links to auth-service user IDs. Run **auth-service seed first** so those users exist. Seed creates:
   - One **patient** profile for `patient@doctornow.com` (userId: `22222222-2222-2222-2222-222222222222`)
   - One **doctor** profile for `doctor@doctornow.com` (userId: `11111111-1111-1111-1111-111111111111`)

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

