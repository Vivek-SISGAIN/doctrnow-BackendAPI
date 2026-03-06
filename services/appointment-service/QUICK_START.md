# Quick Start Guide - Appointment Service Database Setup

## 🚀 Quick Setup (3 Steps)

### Step 1: Install Dependencies
```bash
cd doc_front_back_test/doctrnow-BackendAPI/services/appointment-service
npm install
```

### Step 2: Setup Database (One Command)
```bash
npm run db:setup
```

This command will:
- ✅ Generate Prisma Client
- ✅ Create and apply database migrations
- ✅ Set up all tables (slots, appointments, slot_locks)

### Step 3: Seed Sample Data (Optional)
```bash
npm run seed
```

## 📋 Detailed Setup

### 1. Environment Configuration

Create `.env` file:
```bash
DATABASE_URL=postgresql://username:password@localhost:5432/doctornow_appointments?schema=public
PORT=3003
NODE_ENV=development
```

### 2. Database Migration

The migration file is already created at:
```
prisma/migrations/20250101000000_init/migration.sql
```

To apply it:

**Option A: Development (creates migration if needed)**
```bash
npm run prisma:migrate
```

**Option B: Production (applies existing migrations)**
```bash
npm run prisma:migrate:deploy
```

### 3. Verify Setup

Check migration status:
```bash
npm run prisma:migrate:status
```

View database in Prisma Studio:
```bash
npm run prisma:studio
```

## 🔍 Verification Checklist

After running `npm run db:setup`, verify:

- [ ] Prisma Client generated (`node_modules/.prisma/client` exists)
- [ ] Database tables created:
  - [ ] `slots` table
  - [ ] `appointments` table  
  - [ ] `slot_locks` table
- [ ] Enums created:
  - [ ] `SlotStatus`
  - [ ] `AppointmentStatus`
  - [ ] `PaymentStatus`
  - [ ] `ConsultationType`
- [ ] Indexes created (check with `prisma:studio`)

## 🐛 Troubleshooting

### Migration Already Applied?
If you see "Migration already applied", that's fine! The database is ready.

### Reset Database (⚠️ Deletes All Data)
```bash
npm run prisma:migrate:reset
```

### Check Database Connection
```bash
# Test connection
npx prisma db pull
```

## ✅ Success Indicators

You'll know it worked when:
1. ✅ No errors in terminal
2. ✅ Can run `npm run prisma:studio` and see tables
3. ✅ Service starts without database errors
4. ✅ API endpoints respond correctly

## 📚 Next Steps

After database setup:
1. Start the service: `npm run dev`
2. Seed data: `npm run seed` (optional)
3. Test API endpoints
4. Integrate with frontend

## 🆘 Need Help?

See `SETUP.md` for detailed troubleshooting and advanced configuration.
