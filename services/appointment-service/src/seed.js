/* eslint-disable no-console */
require('dotenv').config();
const prisma = require('./prisma/prisma');

// Align with profile-service seed: doctor id and patient id (profile entity IDs)
const SAMPLE_DOCTOR_ID = process.env.SAMPLE_DOCTOR_ID || '00000000-0000-0000-0000-000000000001';
const SEED_PATIENT_ID = process.env.SEED_PATIENT_ID || '00000000-0000-0000-0000-000000000101';
// Fixed appointment IDs so consultation-service and medical-records-service can reference them
const SEED_APPOINTMENT_IDS = [
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000004',
  'a1000000-0000-0000-0000-000000000005',
  'a1000000-0000-0000-0000-000000000006',
  'a1000000-0000-0000-0000-000000000007',
  'a1000000-0000-0000-0000-000000000008',
];
// Comma-separated list of extra doctor IDs to create slots for (e.g. profile-service doctor UUIDs)
const ADDITIONAL_DOCTOR_IDS = process.env.ADDITIONAL_DOCTOR_IDS
  ? process.env.ADDITIONAL_DOCTOR_IDS.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const ALL_DOCTOR_IDS_FOR_SLOTS = [SAMPLE_DOCTOR_ID, ...ADDITIONAL_DOCTOR_IDS].filter(
  (id, i, arr) => arr.indexOf(id) === i
);

const patientNames = [
  'Sarah Ahmed',
  'Mohammed Ali',
  'Fatima Hassan',
  'Ahmed Khalid',
  'Layla Omar',
  'Yusuf Ibrahim',
  'Maryam Saleh',
  'Omar Hassan',
];

const concerns = [
  'Regular checkup',
  'Chest pain consultation',
  'Follow-up appointment',
  'Blood pressure review',
  'Heart palpitations',
  'ECG results discussion',
  'Medication review',
  'Post-surgery follow-up',
];

const reasons = [
  'Annual health checkup and blood pressure monitoring. Patient reports occasional headaches.',
  'Recurring chest discomfort, especially after physical activity. No shortness of breath.',
  'Follow-up for migraine treatment effectiveness. Patient tracking headache frequency.',
  'Quarterly BP medication review. Patient self-monitoring shows improved readings.',
  'Experiencing occasional heart palpitations, especially at night. No chest pain.',
  'Review of recent ECG and stress test results.',
  'Review current medication regimen. Patient reports side effects from new medication.',
  '2-week post-operative follow-up after cardiac stent placement.',
];

function getFirstSlotDate(now) {
  const todayEnd = new Date(now);
  todayEnd.setHours(17, 0, 0, 0);
  const firstDate = new Date(now);
  if (now >= todayEnd) {
    firstDate.setDate(firstDate.getDate() + 1);
    firstDate.setHours(9, 0, 0, 0);
  } else {
    firstDate.setHours(9, 0, 0, 0);
    if (firstDate < now) {
      const mins = now.getMinutes();
      const next = mins <= 30 ? 30 : 60;
      firstDate.setMinutes(next, 0, 0);
      if (next === 60) firstDate.setHours(firstDate.getHours() + 1, 0, 0, 0);
      if (firstDate.getHours() >= 17) {
        firstDate.setDate(firstDate.getDate() + 1);
        firstDate.setHours(9, 0, 0, 0);
      }
    }
  }
  return firstDate;
}

async function createSlotsForDoctor(doctorId, now, firstDate) {
  const slots = [];
  const SLOTS_PER_DAY = 16;
  for (let day = 0; day < 14; day++) {
    const date = new Date(firstDate);
    date.setDate(date.getDate() + day);
    date.setHours(9, 0, 0, 0);

    for (let i = 0; i < SLOTS_PER_DAY; i++) {
      const startTime = new Date(date);
      startTime.setMinutes(date.getMinutes() + i * 30, 0, 0);
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + 30);
      if (startTime.getHours() >= 17) break;

      slots.push({
        doctorId,
        startTime,
        endTime,
        status: 'AVAILABLE',
      });
    }
  }

  if (slots.length === 0) {
    const startTime = new Date(now);
    startTime.setDate(startTime.getDate() + 1);
    startTime.setHours(9, 0, 0, 0);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + 30);
    slots.push({
      doctorId,
      startTime,
      endTime,
      status: 'AVAILABLE',
    });
  }

  const created = await prisma.slot.createMany({
    data: slots,
    skipDuplicates: true,
  });
  return created.count;
}

async function createSlots() {
  const now = new Date();
  const firstDate = getFirstSlotDate(now);

  let totalCreated = 0;
  for (const doctorId of ALL_DOCTOR_IDS_FOR_SLOTS) {
    console.log('Creating slots for doctor', doctorId, '...');

    const deleted = await prisma.slot.deleteMany({
      where: {
        doctorId,
        status: 'AVAILABLE',
        startTime: { gte: now },
      },
    });
    if (deleted.count > 0) {
      console.log('  Removed', deleted.count, 'existing future available slots');
    }

    const count = await createSlotsForDoctor(doctorId, now, firstDate);
    totalCreated += count;
    console.log('  Created', count, 'slots (next 14 days, 9 AM–5 PM, 30 min)');
  }

  console.log('Total slots created:', totalCreated);
  return totalCreated;
}

async function createAppointments() {
  console.log('Creating appointments...');

  // Get available slots
  const slots = await prisma.slot.findMany({
    where: {
      doctorId: SAMPLE_DOCTOR_ID,
      status: 'AVAILABLE',
      startTime: {
        gte: new Date(),
      },
    },
    orderBy: {
      startTime: 'asc',
    },
    take: 8, // Create 8 appointments
  });

  if (slots.length === 0) {
    console.log('No available slots found. Creating slots first...');
    await createSlots();
    const newSlots = await prisma.slot.findMany({
      where: {
        doctorId: SAMPLE_DOCTOR_ID,
        status: 'AVAILABLE',
        startTime: {
          gte: new Date(),
        },
      },
      orderBy: {
        startTime: 'asc',
      },
      take: 8,
    });
    slots.push(...newSlots);
  }

  const appointments = [];
  const statuses = ['CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'COMPLETED', 'CONFIRMED', 'CONFIRMED'];
  const paymentStatuses = ['PAID', 'PAID', 'PAID', 'PAID', 'PAID', 'PAID', 'PAID', 'PAID'];
  for (let i = 0; i < Math.min(slots.length, 8); i++) {
    const slot = slots[i];
    const status = statuses[i] || 'CONFIRMED';
    // All seed appointments for the profile seed patient so "My Appointments" shows them
    const appointmentId = SEED_APPOINTMENT_IDS[i];

    const appointment = await prisma.$transaction(async (tx) => {
      const apt = await tx.appointment.upsert({
        where: { id: appointmentId },
        update: {
          slotId: slot.id,
          status,
          paymentStatus: paymentStatuses[i] || 'PAID',
          reason: reasons[i] || concerns[i] || 'General consultation',
          notes: `Appointment for ${patientNames[i] || `Patient ${i + 1}`}`,
        },
        create: {
          id: appointmentId,
          patientId: SEED_PATIENT_ID,
          doctorId: SAMPLE_DOCTOR_ID,
          slotId: slot.id,
          status,
          hospitalId: "7a8b9c0d-1e2f-4a3b-8c9d-0e1f2a3b4c5d",
          paymentStatus: paymentStatuses[i] || 'PAID',
          consultationType: 'VIDEO',
          reason: reasons[i] || concerns[i] || 'General consultation',
          notes: `Appointment for ${patientNames[i] || `Patient ${i + 1}`}`,
        },
        include: {
          slot: true,
        },
      });
      // Mark slot as booked (idempotent for re-seed)
      await tx.slot.update({
        where: { id: slot.id },
        data: { status: 'BOOKED' },
      });
      return apt;
    });

    appointments.push(appointment);
    console.log(`Created appointment ${i + 1}: ${patientNames[i]} - ${slot.startTime.toISOString()}`);
  }

  console.log(`Created ${appointments.length} appointments`);
  return appointments;
}

async function main() {
  try {
    console.log('Starting seed...');

    // Create slots first
    await createSlots();

    // Create appointments
    await createAppointments();

    console.log('Seed completed successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('Seed script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seed script failed:', error);
    process.exit(1);
  });
