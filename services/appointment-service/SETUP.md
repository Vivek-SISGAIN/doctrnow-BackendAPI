# Appointment Service Setup Guide

This guide will help you set up the appointment service database using Prisma.

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database running
- Environment variables configured

## Step 1: Install Dependencies

```bash
cd doc_front_back_test/doctrnow-BackendAPI/services/appointment-service
npm install
```

## Step 2: Configure Environment Variables

Create a `.env` file in the service directory:

```bash
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/doctornow_appointments?schema=public

# Server
PORT=3003
HOST=localhost
NODE_ENV=development

# CORS
CORS_ORIGIN=http://localhost:8080

# Optional: For seeding with real IDs
# SAMPLE_DOCTOR_ID=your-doctor-id-here
# SAMPLE_PATIENT_IDS=patient-id-1,patient-id-2,patient-id-3
```

## Step 3: Generate Prisma Client

```bash
npm run prisma:generate
```

This generates the Prisma Client based on your schema.

## Step 4: Run Database Migrations

### Option A: Create and Apply Migration (Development)

```bash
npm run prisma:migrate
```

This will:
- Create a new migration based on schema changes
- Apply the migration to your database
- Generate Prisma Client automatically

### Option B: Apply Existing Migration (Production)

If migrations already exist:

```bash
npx prisma migrate deploy
```

This applies all pending migrations without creating new ones.

## Step 5: Verify Database Schema

You can verify the database schema was created correctly:

```bash
# Open Prisma Studio to view your database
npm run prisma:studio
```

This opens a web interface at `http://localhost:5555` where you can:
- View all tables (slots, appointments, slot_locks)
- See the data in each table
- Manually edit records

## Step 6: Seed the Database (Optional)

After setting up the database, you can seed it with sample data:

```bash
npm run seed
```

**Note**: The seed script uses placeholder UUIDs for doctor and patient IDs. To use real IDs:

1. Get actual doctor and patient IDs from the profile service
2. Set them in your `.env` file:
   ```
   SAMPLE_DOCTOR_ID=actual-doctor-uuid
   SAMPLE_PATIENT_IDS=patient-uuid-1,patient-uuid-2,patient-uuid-3
   ```
3. Run the seed script again

## Step 7: Start the Service

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The service will be available at `http://localhost:3003`

## Troubleshooting

### Migration Issues

If you encounter migration errors:

1. **Reset the database** (⚠️ WARNING: This deletes all data):
   ```bash
   npx prisma migrate reset
   ```

2. **Check migration status**:
   ```bash
   npx prisma migrate status
   ```

3. **Manually fix migration conflicts**:
   - Check `prisma/migrations/` directory
   - Review migration SQL files
   - Fix any conflicts manually

### Database Connection Issues

1. Verify your `DATABASE_URL` is correct
2. Ensure PostgreSQL is running
3. Check database credentials
4. Verify the database exists:
   ```bash
   psql -U username -d doctornow_appointments -c "\dt"
   ```

### Prisma Client Issues

If you get "Prisma Client not generated" errors:

```bash
# Regenerate the client
npm run prisma:generate

# Or delete node_modules and reinstall
rm -rf node_modules
npm install
npm run prisma:generate
```

## Database Schema Overview

The appointment service uses three main tables:

1. **slots** - Doctor availability slots
   - `id` (UUID, Primary Key)
   - `doctorId` (String, Indexed)
   - `startTime` (DateTime, Indexed)
   - `endTime` (DateTime)
   - `status` (Enum: AVAILABLE, BOOKED, CANCELLED, BLOCKED)
   - `createdAt`, `updatedAt` (Timestamps)

2. **appointments** - Patient appointments
   - `id` (UUID, Primary Key)
   - `patientId` (String, Indexed)
   - `doctorId` (String, Indexed)
   - `slotId` (String, Unique, Foreign Key to slots)
   - `status` (Enum: PENDING, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW)
   - `paymentStatus` (Enum: PENDING, PAID, FAILED, REFUNDED)
   - `consultationType` (Enum: VIDEO, AUDIO, CHAT)
   - `reason`, `notes` (Optional Text)
   - `familyMemberId` (Optional String)
   - `createdAt`, `updatedAt` (Timestamps)

3. **slot_locks** - Temporary locks to prevent double-booking
   - `slotId` (String, Primary Key, Foreign Key to slots)
   - `lockedBy` (Optional String)
   - `expiresAt` (DateTime, Indexed)
   - `createdAt` (Timestamp)

## Next Steps

After setup:
1. ✅ Database schema is created
2. ✅ Prisma Client is generated
3. ✅ Service can connect to database
4. ✅ API endpoints are ready to use
5. ✅ Frontend integration is complete

You can now:
- Create appointments via API
- View appointments in doctor portal
- Manage slots and appointments
- Test the full appointment flow
