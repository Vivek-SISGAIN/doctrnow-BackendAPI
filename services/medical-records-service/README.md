# Medical Records Service

Manages prescriptions, medical documents, and patient records for DoctorNow.

## Features

- **Prescription Management**: Create, update, sign, send, and track prescription lifecycle
- **Document Management**: Upload, view, and manage medical documents (lab reports, radiology, etc.)
- **Prescription Lifecycle**: DRAFT → SIGNED → SENT → VIEWED

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```env
DATABASE_URL=postgresql://username:password@localhost:5432/doctornow_medical_records?schema=public
PORT=3004
NODE_ENV=development
```

3. **Create the PostgreSQL database (required once).** Prisma does not create the database—only tables inside it.
   - **DBeaver:** Connect to PostgreSQL (localhost:5432), then right‑click **Databases** → **Create New Database** → name: `doctornow_medical_records`.
   - **psql:** `psql -U postgres -c "CREATE DATABASE doctornow_medical_records;"`

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

### Prescriptions

- `POST /api/prescriptions` - Create prescription
- `GET /api/prescriptions/:id` - Get prescription by ID
- `GET /api/prescriptions/rx/:rxId` - Get prescription by RX ID
- `GET /api/prescriptions/patient/:patientId` - Get patient prescriptions
- `GET /api/prescriptions/doctor/:doctorId` - Get doctor prescriptions
- `PUT /api/prescriptions/:id` - Update prescription
- `POST /api/prescriptions/:id/sign` - Sign prescription
- `POST /api/prescriptions/:id/send` - Send prescription
- `POST /api/prescriptions/:id/view` - Mark as viewed
- `DELETE /api/prescriptions/:id` - Delete prescription

### Documents

- `POST /api/documents` - Upload document
- `GET /api/documents/:id` - Get document by ID
- `GET /api/documents/patient/:patientId` - Get patient documents
- `GET /api/documents/doctor/:doctorId` - Get doctor documents
- `GET /api/documents/appointment/:appointmentId` - Get appointment documents
- `GET /api/documents/consultation/:consultationId` - Get consultation documents
- `PUT /api/documents/:id` - Update document
- `DELETE /api/documents/:id` - Delete document

## Database Schema

See `prisma/schema.prisma` for complete schema definition.
