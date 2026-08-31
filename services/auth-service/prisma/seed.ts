/**
 * Auth Service - Database Seed
 * Creates default tenant, users (doctor + patient), and ensures JWT key exists.
 * Run: npx prisma db seed
 */
import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DOCTOR_USER_ID = '11111111-1111-1111-1111-111111111111';
const PATIENT_USER_ID = '22222222-2222-2222-2222-222222222222';
const TEST_PATIENT_USER_ID = '33333333-3333-3333-3333-333333333333';
const SUPER_ADMIN_USER_ID = '55555555-5555-5555-5555-555555555555';
const HOSPITAL_ADMIN_USER_ID = '44444444-4444-4444-4444-444444444444';

const SEED_PASSWORD = 'Password123!'; // Change in production

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  // Upsert tenant (auth schema doesn't have Tenant table; we just use a fixed UUID)
  // Create/update seed users
  const doctor = await prisma.user.upsert({
    where: { id: DOCTOR_USER_ID },
    update: { passwordHash }, // always refresh so seed password works after re-seed
    create: {
      id: DOCTOR_USER_ID,
      tenantId: DEFAULT_TENANT_ID,
      email: 'doctor@doctornow.com',
      mobile: '+971501234567',
      passwordHash,
      role: UserRole.DOCTOR,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
    },
  });

  const patient = await prisma.user.upsert({
    where: { id: PATIENT_USER_ID },
    update: { passwordHash }, // always refresh so seed password works after re-seed
    create: {
      id: PATIENT_USER_ID,
      tenantId: DEFAULT_TENANT_ID,
      email: 'patient@doctornow.com',
      mobile: '+971509876543',
      passwordHash,
      role: UserRole.PATIENT,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
    },
  });

  const hospitalAdmin = await prisma.user.upsert({
    where: { id: HOSPITAL_ADMIN_USER_ID },
    update: { passwordHash },
    create: {
      id: HOSPITAL_ADMIN_USER_ID,
      tenantId: DEFAULT_TENANT_ID,
      email: 'admin@citycarehospital.com',
      mobile: '+971501234580',
      passwordHash,
      role: UserRole.HOSPITAL_ADMIN,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
    },
  });

  console.log('  Hospital Admin:', hospitalAdmin.email, '(id:', hospitalAdmin.id, ')');

  const superAdmin = await prisma.user.upsert({
    where: { id: SUPER_ADMIN_USER_ID },
    update: { passwordHash },
    create: {
      id: SUPER_ADMIN_USER_ID,
      tenantId: DEFAULT_TENANT_ID,
      email: 'superadmin@doctornow.com',
      mobile: '+971501111111',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
    },
  });

  console.log('  Super Admin:', superAdmin.email, '(id:', superAdmin.id, ')');
  // Test patient (nitin.sisgain@gmail.com) – same password, same tenant for patient portal login
  const testPatient = await prisma.user.upsert({
    where: { id: TEST_PATIENT_USER_ID },
    update: { passwordHash }, // always refresh hash so seed password is correct
    create: {
      id: TEST_PATIENT_USER_ID,
      tenantId: DEFAULT_TENANT_ID,
      email: 'nitin.sisgain@gmail.com',
      mobile: null,
      passwordHash,
      role: UserRole.PATIENT,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
    },
  });

  const opDoctor = await prisma.user.upsert({
    where: { id: '11111111-1111-1111-1111-111111111115' },
    update: { passwordHash },
    create: {
      id: '11111111-1111-1111-1111-111111111115',
      tenantId: DEFAULT_TENANT_ID,
      email: 'tariq.mansoor@doctornow.com',
      mobile: '+971501234571',
      passwordHash,
      role: UserRole.DOCTOR,
      status: UserStatus.ACTIVE,
      failedLoginAttempts: 0,
    },
  });

  console.log('Auth seed completed:');
  console.log('  Doctor:', doctor.email, '(id:', doctor.id, ')');
  console.log('  Ophthalmology Doctor:', opDoctor.email, '(id:', opDoctor.id, ')');
  console.log('  Patient:', patient.email, '(id:', patient.id, ')');
  console.log('  Test patient:', testPatient.email, '(id:', testPatient.id, ')');
  console.log('  Password for all:', SEED_PASSWORD);
  console.log('  Tenant ID:', DEFAULT_TENANT_ID);

  // JWT key is created by JwtKeyService.onModuleInit when auth-service starts; no seed needed
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
