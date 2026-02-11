/**
 * Profile Service - Database Seed
 * Creates a seed patient and doctor linked to auth-service user IDs.
 * Run auth-service seed first so these user IDs exist in auth_db.
 * Run: npx prisma db seed
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DOCTOR_USER_ID = '11111111-1111-1111-1111-111111111111';
const PATIENT_USER_ID = '22222222-2222-2222-2222-222222222222';

async function main() {
  const patient = await prisma.patient.upsert({
    where: { userId: PATIENT_USER_ID },
    update: {},
    create: {
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
      maritalStatus: 'SINGLE',
    },
  });

  const doctor = await prisma.doctor.upsert({
    where: { userId: DOCTOR_USER_ID },
    update: {},
    create: {
      userId: DOCTOR_USER_ID,
      status: 'ACTIVE',
      fullName: 'Dr. Sarah Doctor',
      email: 'doctor@doctornow.com',
      mobile: '+971501234567',
      gender: 'FEMALE',
      nationality: 'UAE',
      emiratesId: '784-1985-7654321-2',
      primarySpecialization: 'General Practice',
      subSpecialization: 'Family Medicine',
      licenseNumber: 'DHA-GP-2020-001',
      licenseType: 'DHA',
      licenseExpiry: new Date('2026-12-31'),
      yearsOfExperience: 8,
      medicalDegree: 'MBBS',
      university: 'Dubai Medical College',
      profileImage: 'https://api.dicebear.com/7.x/avataaars/svg?seed=doctor',
      languagesSpoken: ['English', 'Arabic'],
      servicesOffered: ['VIDEO', 'PHONE', 'CHAT'],
      certifications: ['DHA', 'MOH'],
      professionalMemberships: ['EMA'],
      professionalBio: 'Experienced general practitioner with focus on family medicine.',
      workingDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'SUNDAY'],
      workingHoursFrom: '09:00',
      workingHoursTo: '18:00',
      consultationDuration: 30,
      videoConsultationFee: 150,
      phoneConsultationFee: 100,
      followUpFee: 75,
      hospitalSharePercent: 70,
      platformSharePercent: 30,
    },
  });

  console.log('Profile seed completed:');
  console.log('  Patient:', patient.firstName, patient.lastName, '(userId:', patient.userId, ')');
  console.log('  Doctor:', doctor.fullName, '(userId:', doctor.userId, ')');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
