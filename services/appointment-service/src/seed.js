/* eslint-disable no-console */
require('dotenv').config();
const prisma = require('./prisma/prisma');

// Sample data - these IDs should match actual patient and doctor IDs from profile service
// In production, you would fetch these from the profile service or use real IDs
// For seeding, we'll use placeholder UUIDs that can be updated later
const SAMPLE_DOCTOR_ID = process.env.SAMPLE_DOCTOR_ID || '00000000-0000-0000-0000-000000000001';
const SAMPLE_PATIENT_IDS = process.env.SAMPLE_PATIENT_IDS 
  ? process.env.SAMPLE_PATIENT_IDS.split(',')
  : [
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000103',
      '00000000-0000-0000-0000-000000000104',
      '00000000-0000-0000-0000-000000000105',
      '00000000-0000-0000-0000-000000000106',
      '00000000-0000-0000-0000-000000000107',
      '00000000-0000-0000-0000-000000000108',
    ];

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

async function createSlots() {
  console.log('Creating slots...');
  const slots = [];
  const now = new Date();
  
  // Create slots for the next 7 days
  for (let day = 0; day < 7; day++) {
    const date = new Date(now);
    date.setDate(date.getDate() + day);
    date.setHours(9, 0, 0, 0); // Start at 9 AM
    
    // Create slots every 30 minutes from 9 AM to 5 PM
    for (let hour = 9; hour < 17; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const startTime = new Date(date);
        startTime.setHours(hour, minute, 0, 0);
        
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + 30);
        
        // Skip past slots
        if (startTime < now) continue;
        
        slots.push({
          doctorId: SAMPLE_DOCTOR_ID,
          startTime,
          endTime,
          status: 'AVAILABLE',
        });
      }
    }
  }
  
  // Create slots in bulk
  const created = await prisma.slot.createMany({
    data: slots,
    skipDuplicates: true,
  });
  
  console.log(`Created ${created.count} slots`);
  return slots;
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
  
  for (let i = 0; i < Math.min(slots.length, SAMPLE_PATIENT_IDS.length); i++) {
    const slot = slots[i];
    const patientId = SAMPLE_PATIENT_IDS[i];
    const status = statuses[i] || 'CONFIRMED';
    
    // Create appointment
    const appointment = await prisma.$transaction(async (tx) => {
      const apt = await tx.appointment.create({
        data: {
          patientId,
          doctorId: SAMPLE_DOCTOR_ID,
          slotId: slot.id,
          status,
          paymentStatus: paymentStatuses[i] || 'PAID',
          consultationType: 'VIDEO',
          reason: reasons[i] || concerns[i] || 'General consultation',
          notes: `Appointment for ${patientNames[i] || `Patient ${i + 1}`}`,
        },
        include: {
          slot: true,
        },
      });
      
      // Update slot status
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
