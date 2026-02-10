# Consultation Service

Manages consultation sessions, notes, vitals, and history for DoctorNow.

## Features

- **Consultation Management**: Start, end, and track consultation sessions
- **Clinical Notes**: Save and manage consultation notes (with auto-save support)
- **Vitals Recording**: Record and update patient vitals during consultation
- **Consultation History**: Get consultation history for patients and doctors

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```env
DATABASE_URL=postgresql://username:password@localhost:5432/doctornow_consultations?schema=public
PORT=3005
NODE_ENV=development
```

3. **Create the PostgreSQL database (required once).** Prisma does not create the database—only tables inside it.
   - **Option A – DBeaver:** Connect to PostgreSQL (localhost:5432, user `postgres`), then right‑click **Databases** → **Create New Database** → name: `doctornow_consultations` → OK.
   - **Option B – psql:** `psql -U postgres -c "CREATE DATABASE doctornow_consultations;"`

4. Setup database (generate client + run migrations):
```bash
npm run db:setup
```

5. (Optional) Seed sample data:
```bash
npm run db:seed
```

6. Start server:
```bash
npm run dev
```

## API Endpoints

### Consultations

- `POST /api/consultations` - Create consultation
- `GET /api/consultations/:id` - Get consultation by ID
- `GET /api/consultations/appointment/:appointmentId` - Get consultation by appointment
- `POST /api/consultations/appointment/:appointmentId/start` - Start consultation
- `POST /api/consultations/:id/end` - End consultation
- `GET /api/consultations/history/patient/:patientId` - Get patient history
- `GET /api/consultations/history/doctor/:doctorId` - Get doctor history
- `PUT /api/consultations/:id` - Update consultation
- `POST /api/consultations/:id/no-show` - Mark as no-show

### Consultation Notes

- `POST /api/consultation-notes` - Create note
- `POST /api/consultation-notes/save` - Auto-save note (updates if recent)
- `GET /api/consultation-notes/:id` - Get note by ID
- `GET /api/consultation-notes/consultation/:consultationId` - Get consultation notes
- `PUT /api/consultation-notes/:id` - Update note
- `DELETE /api/consultation-notes/:id` - Delete note

### Consultation Vitals

- `POST /api/consultation-vitals` - Create or update vitals
- `GET /api/consultation-vitals/consultation/:consultationId` - Get vitals
- `DELETE /api/consultation-vitals/consultation/:consultationId` - Delete vitals

## Database Schema

See `prisma/schema.prisma` for complete schema definition.
