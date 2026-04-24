/**
 * Profile Service - Database Seed
 * Creates specialties, seed patient and doctors linked to auth-service user IDs.
 * Run auth-service seed first so these user IDs exist in auth_db.
 * Run: npx prisma db seed
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DOCTOR_USER_ID = '11111111-1111-1111-1111-111111111111';
const PATIENT_USER_ID = '22222222-2222-2222-2222-222222222222';
const TEST_PATIENT_USER_ID = '33333333-3333-3333-3333-333333333333';
const SEED_DOCTOR_ID = '00000000-0000-0000-0000-000000000001';
const SEED_PATIENT_ID = '00000000-0000-0000-0000-000000000101';
const SEED_TEST_PATIENT_ID = '00000000-0000-0000-0000-000000000103';

const HOSPITAL_ADMIN_USER_ID = '44444444-4444-4444-4444-444444444444';
const SUPER_ADMIN_USER_ID = '55555555-5555-5555-5555-555555555555';

const SEED_HOSPITAL_ADMIN_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SEED_SUPER_ADMIN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const SPECIALTIES = [
  {
    name: 'General Physician',
    slug: 'general-physician',
    imageKey: 'general-physician',
    bgColor: 'bg-purple-100',
    displayOrder: 1
  },
  {
    name: 'Ophthalmology',
    slug: 'ophthalmology',
    imageKey: 'ophthalmology',
    bgColor: 'bg-blue-100',
    displayOrder: 2
  },
  {
    name: 'Neurology',
    slug: 'neurology',
    imageKey: 'neurology',
    bgColor: 'bg-teal-100',
    displayOrder: 3
  },
  {
    name: 'Orthopedics',
    slug: 'orthopedics',
    imageKey: 'orthopedics',
    bgColor: 'bg-green-100',
    displayOrder: 4
  },
  {
    name: 'Pediatrics',
    slug: 'pediatrics',
    imageKey: 'pediatrics',
    bgColor: 'bg-pink-100',
    displayOrder: 5
  },
  {
    name: 'Vaccination',
    slug: 'vaccination',
    imageKey: 'vaccination',
    bgColor: 'bg-yellow-100',
    displayOrder: 6
  },
  {
    name: 'Cardiology',
    slug: 'cardiology',
    imageKey: 'cardiology',
    bgColor: 'bg-red-100',
    displayOrder: 7
  },
  {
    name: 'Pulmonology',
    slug: 'pulmonology',
    imageKey: 'pulmonology',
    bgColor: 'bg-cyan-100',
    displayOrder: 8
  },
  {
    name: 'Pharmacy',
    slug: 'pharmacy',
    imageKey: 'pharmacy',
    bgColor: 'bg-orange-100',
    displayOrder: 9
  },
  {
    name: 'Laboratory',
    slug: 'laboratory',
    imageKey: 'laboratory',
    bgColor: 'bg-violet-100',
    displayOrder: 10
  },
  { name: 'ENT', slug: 'ent', imageKey: 'ent', bgColor: 'bg-indigo-100', displayOrder: 11 },
  {
    name: 'Dermatology',
    slug: 'dermatology',
    imageKey: 'dermatology',
    bgColor: 'bg-amber-100',
    displayOrder: 12
  },
  {
    name: 'Dentistry',
    slug: 'dentistry',
    imageKey: 'dentistry',
    bgColor: 'bg-emerald-100',
    displayOrder: 13
  },
  {
    name: 'Nephrology',
    slug: 'nephrology',
    imageKey: 'nephrology',
    bgColor: 'bg-rose-100',
    displayOrder: 14
  },
  {
    name: 'Immunology',
    slug: 'immunology',
    imageKey: 'immunology',
    bgColor: 'bg-lime-100',
    displayOrder: 15
  },
  {
    name: 'Physiotherapy',
    slug: 'physiotherapy',
    imageKey: 'physiotherapy',
    bgColor: 'bg-amber-100',
    displayOrder: 16
  }
];

// ─── Reusable schedule helpers ────────────────────────────────────────────────

function makeSchedule(days, from, to) {
  return Object.fromEntries(days.map((day) => [day, { from, to }]));
}

const FULL_WEEK_SCHEDULE = makeSchedule(
  ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'SUNDAY'],
  '09:00',
  '18:00'
);

const WEEKDAY_SCHEDULE = makeSchedule(
  ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY'],
  '09:00',
  '17:00'
);

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  // Seed specialties
  for (const s of SPECIALTIES) {
    await prisma.specialty.upsert({
      where: { slug: s.slug },
      update: {
        name: s.name,
        imageKey: s.imageKey,
        bgColor: s.bgColor,
        displayOrder: s.displayOrder
      },
      create: s
    });
  }
  console.log('Specialties seeded:', SPECIALTIES.length);

  const patient = await prisma.patient.upsert({
    where: { userId: PATIENT_USER_ID },
    update: {},
    create: {
      id: SEED_PATIENT_ID,
      userId: PATIENT_USER_ID,
      mobileNumber: '+971509876543',
      profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=patient',
      email: 'patient@doctornow.com',
      firstName: 'Ahmed',
      lastName: 'Patient',
      dateOfBirth: new Date('1990-05-15'),
      gender: 'MALE',
      emiratesId: '784-1990-1234567-1',
      nationality: 'UAE',
      bloodGroup: 'O_POS',
      maritalStatus: 'SINGLE'
    }
  });

  const testPatient = await prisma.patient.upsert({
    where: { userId: TEST_PATIENT_USER_ID },
    update: {},
    create: {
      id: SEED_TEST_PATIENT_ID,
      userId: TEST_PATIENT_USER_ID,
      mobileNumber: '+971501112233',
      profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nitin',
      email: 'nitin.sisgain@gmail.com',
      firstName: 'Nitin',
      lastName: 'User',
      dateOfBirth: new Date('1995-01-01'),
      gender: 'MALE',
      emiratesId: '784-1995-1111111-1',
      nationality: 'India',
      bloodGroup: 'B_POS',
      maritalStatus: 'SINGLE'
    }
  });

  const hospitalAdmin = await prisma.hospitalAdmin.upsert({
    where: { userId: HOSPITAL_ADMIN_USER_ID },
    update: {},
    create: {
      id: SEED_HOSPITAL_ADMIN_ID,
      userId: HOSPITAL_ADMIN_USER_ID,

      fullName: 'John Admin',
      email: 'admin@citycarehospital.com',
      phoneNumber: '+971501234580',

      gender: 'MALE',
      nationality: 'UAE',
      emiratesId: '784-1980-9999999-1',

      hospitalName: 'City Care Hospital',
      hospitalId: '7a8b9c0d-1e2f-4a3b-8c9d-0e1f2a3b4c5d',

      position: 'Hospital Administrator',
      department: 'Management',

      profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=hospitalAdmin'
    }
  });

  console.log(hospitalAdmin, 'hospitalAdmin');

  const superAdmin = await prisma.superAdmin.upsert({
    where: { userId: SUPER_ADMIN_USER_ID },
    update: {},
    create: {
      id: SEED_SUPER_ADMIN_ID,
      userId: SUPER_ADMIN_USER_ID,

      fullName: 'Super Admin',
      email: 'superadmin@doctornow.com',
      phoneNumber: '+971501111111',

      gender: 'MALE',
      nationality: 'UAE',
      emiratesId: '784-1975-8888888-1',

      profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=superAdmin'
    }
  });

  console.log(superAdmin, 'superAdmin');

  const doctor = await prisma.doctor.upsert({
    where: { userId: DOCTOR_USER_ID },
    update: { primarySpecialization: 'General Physician' },
    create: {
      id: SEED_DOCTOR_ID,
      userId: DOCTOR_USER_ID,
      status: 'ACTIVE',
      fullName: 'Dr. Sarah Doctor',
      email: 'doctor@doctornow.com',
      mobile: '+971501234567',
      gender: 'FEMALE',
      nationality: 'UAE',
      emiratesId: '784-1985-7654321-2',
      primarySpecialization: 'General Physician',
      subSpecialization: 'Family Medicine',
      licenseNumber: 'DHA-GP-2020-001',
      licenseType: 'DHA',
      licenseExpiry: new Date('2026-12-31'),
      yearsOfExperience: 8,
      hospitalId: '7a8b9c0d-1e2f-4a3b-8c9d-0e1f2a3b4c5d',

      medicalDegree: 'MBBS',
      university: 'Dubai Medical College',
      profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=doctor',
      languagesSpoken: ['English', 'Arabic'],
      servicesOffered: ['VIDEO', 'PHONE', 'CHAT'],
      certifications: ['DHA', 'MOH'],
      professionalMemberships: ['EMA'],
      professionalBio: 'Experienced general practitioner with focus on family medicine.',
      schedule: FULL_WEEK_SCHEDULE,
      consultationDuration: 30,
      videoConsultationFee: 150,
      phoneConsultationFee: 100,
      followUpFee: 75,
      hospitalSharePercent: 70,
      platformSharePercent: 30
    }
  });

  const baseDoctor = {
    status: 'ACTIVE',
    gender: 'MALE',
    nationality: 'UAE',
    subSpecialization: null,
    licenseType: 'DHA',
    licenseExpiry: new Date('2026-12-31'),
    yearsOfExperience: 10,
    medicalDegree: 'MBBS',
    university: 'Dubai Medical College',
    profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=doc2',
    languagesSpoken: ['English', 'Arabic'],
    servicesOffered: ['VIDEO', 'PHONE'],
    certifications: ['DHA'],
    professionalMemberships: [],
    professionalBio: 'Experienced specialist.',
    schedule: WEEKDAY_SCHEDULE,
    consultationDuration: 30,
    videoConsultationFee: 200,
    phoneConsultationFee: 150,
    followUpFee: 100,
    hospitalSharePercent: 70,
    hospitalId: '7a8b9c0d-1e2f-4a3b-8c9d-0e1f2a3b4c5d',
    platformSharePercent: 30
  };

  const extraDoctors = [
    {
      userId: '11111111-1111-1111-1111-111111111112',
      hospitalId: '7a8b9c0d-1e2f-4a3b-8c9d-0e1f2a3b4c5d',
      primarySpecialization: 'Cardiology',
      fullName: 'Dr. Ahmed Rahman',
      email: 'ahmed.rahman@doctornow.com',
      mobile: '+971501234568',
      licenseNumber: 'DHA-CARD-2021-002',
      emiratesId: '784-1988-2222222-2'
    },
    {
      userId: '11111111-1111-1111-1111-111111111113',
      hospitalId: '7a8b9c0d-1e2f-4a3b-8c9d-0e1f2a3b4c5d',
      primarySpecialization: 'Dermatology',
      fullName: 'Dr. Fatima Hassan',
      email: 'fatima.hassan@doctornow.com',
      mobile: '+971501234569',
      licenseNumber: 'DHA-DERM-2019-003',
      emiratesId: '784-1988-3333333-3'
    },
    {
      userId: '11111111-1111-1111-1111-111111111114',
      hospitalId: '7a8b9c0d-1e2f-4a3b-8c9d-0e1f2a3b4c5d',
      primarySpecialization: 'General Physician',
      fullName: 'Dr. Mohammed Ali',
      email: 'mohammed.ali@doctornow.com',
      mobile: '+971501234570',
      licenseNumber: 'DHA-GP-2022-004',
      emiratesId: '784-1988-4444444-4'
    }
  ];

  for (const d of extraDoctors) {
    await prisma.doctor.upsert({
      where: { userId: d.userId },
      update: { primarySpecialization: d.primarySpecialization },
      create: {
        ...baseDoctor,
        userId: d.userId,
        fullName: d.fullName,
        email: d.email,
        mobile: d.mobile,
        emiratesId: d.emiratesId,
        primarySpecialization: d.primarySpecialization,
        licenseNumber: d.licenseNumber
      }
    });
  }

  console.log('Profile seed completed:');
  console.log(
    '  Patient:',
    patient.firstName,
    patient.lastName,
    '(id:',
    patient.id,
    ', userId:',
    patient.userId,
    ')'
  );
  console.log('  Test patient (Nitin):', testPatient.firstName, '(userId:', testPatient.userId, ')');
  console.log('  Doctor:', doctor.fullName, '(id:', doctor.id, ', userId:', doctor.userId, ')');
  console.log('  Extra doctors:', extraDoctors.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
