/* eslint-disable no-console */
require('dotenv').config();
const prisma = require('./prisma/prisma');

// Align with profile-service (doctor/patient entity IDs) and appointment-service (fixed appointment IDs)
const SAMPLE_DOCTOR_ID = process.env.SAMPLE_DOCTOR_ID || '00000000-0000-0000-0000-000000000001';
const SEED_PATIENT_ID = process.env.SEED_PATIENT_ID || '00000000-0000-0000-0000-000000000101';
const SAMPLE_APPOINTMENT_IDS = [
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000003',
  'a1000000-0000-0000-0000-000000000004',
  'a1000000-0000-0000-0000-000000000005',
];
const SEED_CONSULTATION_IDS = [
  'c1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000002',
  'c1000000-0000-0000-0000-000000000003',
  'c1000000-0000-0000-0000-000000000004',
  'c1000000-0000-0000-0000-000000000005',
];

const diagnoses = [
  'Hypertension - stable on current medication. Advise low sodium diet.',
  'Type 2 diabetes - HbA1c improved. Continue metformin 500mg BD.',
  'Upper respiratory infection. Rest, fluids, OTC symptomatic relief.',
  'Anxiety disorder - follow-up in 4 weeks. Continue current therapy.',
  'Routine checkup - no acute issues. Annual labs advised.',
];

const followUps = [
  'BP check in 4 weeks. Return sooner if headaches or chest pain.',
  'Repeat HbA1c in 3 months. Dietitian referral sent.',
  'Return if fever > 101°F or symptoms worsen after 5 days.',
  'Next session in 2 weeks. Consider medication review.',
  'Routine follow-up in 1 year or if symptoms develop.',
];

async function seedConsultations() {
  console.log('Seeding consultations...');

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const consultationsData = [
    {
      id: SEED_CONSULTATION_IDS[0],
      appointmentId: SAMPLE_APPOINTMENT_IDS[0],
      patientId: SEED_PATIENT_ID,
      doctorId: SAMPLE_DOCTOR_ID,
      status: 'COMPLETED',
      type: 'VIDEO',
      startedAt: twoHoursAgo,
      endedAt: oneHourAgo,
      duration: 900,
      diagnosis: diagnoses[0],
      followUp: followUps[0],
    },
    {
      id: SEED_CONSULTATION_IDS[1],
      appointmentId: SAMPLE_APPOINTMENT_IDS[1],
      patientId: SEED_PATIENT_ID,
      doctorId: SAMPLE_DOCTOR_ID,
      status: 'COMPLETED',
      type: 'VIDEO',
      startedAt: twoHoursAgo,
      endedAt: oneHourAgo,
      duration: 1200,
      diagnosis: diagnoses[1],
      followUp: followUps[1],
    },
    {
      id: SEED_CONSULTATION_IDS[2],
      appointmentId: SAMPLE_APPOINTMENT_IDS[2],
      patientId: SEED_PATIENT_ID,
      doctorId: SAMPLE_DOCTOR_ID,
      status: 'IN_PROGRESS',
      type: 'VIDEO',
      startedAt: oneHourAgo,
      diagnosis: null,
      followUp: null,
    },
    {
      id: SEED_CONSULTATION_IDS[3],
      appointmentId: SAMPLE_APPOINTMENT_IDS[3],
      patientId: SEED_PATIENT_ID,
      doctorId: SAMPLE_DOCTOR_ID,
      status: 'PENDING',
      type: 'AUDIO',
      diagnosis: null,
      followUp: null,
    },
    {
      id: SEED_CONSULTATION_IDS[4],
      appointmentId: SAMPLE_APPOINTMENT_IDS[4],
      patientId: SEED_PATIENT_ID,
      doctorId: SAMPLE_DOCTOR_ID,
      status: 'COMPLETED',
      type: 'CHAT',
      startedAt: twoHoursAgo,
      endedAt: oneHourAgo,
      duration: 600,
      diagnosis: diagnoses[3],
      followUp: followUps[3],
    },
  ];

  const created = [];
  for (const data of consultationsData) {
    const { id, ...rest } = data;
    const c = await prisma.consultation.upsert({
      where: { appointmentId: data.appointmentId },
      update: {
        doctorId: rest.doctorId,
        patientId: rest.patientId,
        status: rest.status,
        type: rest.type,
        startedAt: rest.startedAt,
        endedAt: rest.endedAt,
        duration: rest.duration,
        diagnosis: rest.diagnosis,
        followUp: rest.followUp,
      },
      create: { id, ...rest },
    });
    created.push(c);
  }
  console.log(`Created/updated ${created.length} consultations`);
  return created;
}

async function seedNotes(consultations) {
  console.log('Seeding consultation notes...');

  const noteContents = [
    'Patient reports compliance with medication. BP readings at home 130-138/82-88. No chest pain or shortness of breath.',
    'Discussed diet and exercise. Patient to increase walking to 30 min daily. Will review at next visit.',
    'Symptoms: sore throat, runny nose x 3 days. No fever. Exam via video - oropharynx mildly erythematous.',
    'Session focused on coping strategies. Patient reports improved sleep. Continue current plan.',
    'Clinical notes: General wellness. Vaccination status reviewed. No new concerns.',
  ];

  let count = 0;
  for (let i = 0; i < Math.min(consultations.length, noteContents.length); i++) {
    const existing = await prisma.consultationNote.count({
      where: { consultationId: consultations[i].id },
    });
    if (existing > 0) continue;
    await prisma.consultationNote.create({
      data: {
        consultationId: consultations[i].id,
        content: noteContents[i],
        createdBy: consultations[i].doctorId,
      },
    });
    count++;
  }

  // Add a second note for first two consultations (only if they have no notes yet)
  const extraNotes = [
    'Reminded to avoid added salt. Provided leaflet on DASH diet.',
    'Labs ordered: FBC, U&E, LFT. Follow-up in 3 months.',
  ];
  for (let i = 0; i < 2 && i < consultations.length; i++) {
    const noteCount = await prisma.consultationNote.count({
      where: { consultationId: consultations[i].id },
    });
    if (noteCount >= 2) continue;
    await prisma.consultationNote.create({
      data: {
        consultationId: consultations[i].id,
        content: extraNotes[i],
        createdBy: consultations[i].doctorId,
      },
    });
    count++;
  }
  console.log(`Created ${count} consultation notes`);
}

async function seedVitals(consultations) {
  console.log('Seeding consultation vitals...');

  const vitalsData = [
    { bloodPressure: '132/84', pulse: '78 bpm', temperature: '98.4°F', weight: '82 kg', height: '175 cm', spo2: '98%' },
    { bloodPressure: '128/80', pulse: '72 bpm', temperature: '98.6°F', weight: '75 kg', height: '170 cm', spo2: '99%' },
    { bloodPressure: '118/76', pulse: '68 bpm', temperature: '98.2°F', weight: '70 kg', height: '168 cm' },
  ];

  let count = 0;
  for (let i = 0; i < Math.min(consultations.length, vitalsData.length); i++) {
    await prisma.consultationVitals.upsert({
      where: { consultationId: consultations[i].id },
      update: {},
      create: {
        consultationId: consultations[i].id,
        ...vitalsData[i],
      },
    });
    count++;
  }
  console.log(`Created/updated ${count} consultation vitals`);
}

async function main() {
  try {
    console.log('Starting consultation seed...');

    const consultations = await seedConsultations();
    await seedNotes(consultations);
    await seedVitals(consultations);

    console.log('Consultation seed completed successfully!');
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
