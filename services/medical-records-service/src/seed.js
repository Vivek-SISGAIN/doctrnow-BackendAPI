/* eslint-disable no-console */
require('dotenv').config();
const prisma = require('./prisma/prisma');

const SAMPLE_DOCTOR_ID = process.env.SAMPLE_DOCTOR_ID || '00000000-0000-0000-0000-000000000001';
const SAMPLE_PATIENT_IDS = process.env.SAMPLE_PATIENT_IDS
  ? process.env.SAMPLE_PATIENT_IDS.split(',')
  : [
      '00000000-0000-0000-0000-000000000101',
      '00000000-0000-0000-0000-000000000102',
      '00000000-0000-0000-0000-000000000103',
      '00000000-0000-0000-0000-000000000104',
    ];
const SAMPLE_APPOINTMENT_IDS = [
  'a1000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000003',
];
const SAMPLE_CONSULTATION_IDS = [
  'c1000000-0000-0000-0000-000000000001',
  'c1000000-0000-0000-0000-000000000002',
];

function rxId(seq) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `RX-${y}-${m}${day}-${String(seq).padStart(3, '0')}`;
}

async function seedPrescriptions() {
  console.log('Seeding prescriptions...');

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const prescriptionsData = [
    {
      rxId: rxId(1),
      patientId: SAMPLE_PATIENT_IDS[0],
      doctorId: SAMPLE_DOCTOR_ID,
      appointmentId: SAMPLE_APPOINTMENT_IDS[0],
      consultationId: SAMPLE_CONSULTATION_IDS[0],
      diagnosis: 'Hypertension - stable',
      lifecycle: 'SIGNED',
      signedAt: yesterday,
    },
    {
      rxId: rxId(2),
      patientId: SAMPLE_PATIENT_IDS[1],
      doctorId: SAMPLE_DOCTOR_ID,
      appointmentId: SAMPLE_APPOINTMENT_IDS[1],
      consultationId: null,
      diagnosis: 'Type 2 diabetes - add metformin',
      lifecycle: 'SENT',
      signedAt: yesterday,
      sentAt: yesterday,
    },
    {
      rxId: rxId(3),
      patientId: SAMPLE_PATIENT_IDS[2],
      doctorId: SAMPLE_DOCTOR_ID,
      appointmentId: null,
      consultationId: null,
      diagnosis: 'Upper respiratory infection',
      lifecycle: 'DRAFT',
    },
    {
      rxId: rxId(4),
      patientId: SAMPLE_PATIENT_IDS[3],
      doctorId: SAMPLE_DOCTOR_ID,
      appointmentId: SAMPLE_APPOINTMENT_IDS[2],
      consultationId: SAMPLE_CONSULTATION_IDS[1],
      diagnosis: 'Anxiety - continue current medication',
      lifecycle: 'VIEWED',
      signedAt: yesterday,
      sentAt: yesterday,
      viewedAt: now,
    },
  ];

  const created = [];
  for (const data of prescriptionsData) {
    const p = await prisma.prescription.upsert({
      where: { rxId: data.rxId },
      update: {},
      create: data,
    });
    created.push(p);
  }
  console.log(`Created/updated ${created.length} prescriptions`);
  return created;
}

async function seedPrescriptionMedications(prescriptions) {
  console.log('Seeding prescription medications...');

  const medicationSets = [
    [
      { name: 'Amlodipine', strength: '5 mg', dosage: '1', frequency: 'Once daily', duration: '30 days', isControlled: false, type: 'Tablet', instructions: 'Take in the morning' },
      { name: 'Lisinopril', strength: '10 mg', dosage: '1', frequency: 'Once daily', duration: '30 days', isControlled: false, type: 'Tablet', instructions: null },
    ],
    [
      { name: 'Metformin', strength: '500 mg', dosage: '1', frequency: 'Twice daily', duration: '90 days', isControlled: false, type: 'Tablet', instructions: 'Take with meals' },
    ],
    [
      { name: 'Amoxicillin', strength: '500 mg', dosage: '1', frequency: 'Three times daily', duration: '7 days', isControlled: false, type: 'Capsule', instructions: 'Complete full course' },
      { name: 'Paracetamol', strength: '500 mg', dosage: '2', frequency: 'As needed', duration: '5 days', isControlled: false, type: 'Tablet', instructions: 'Max 4g per day' },
    ],
    [
      { name: 'Sertraline', strength: '50 mg', dosage: '1', frequency: 'Once daily', duration: '30 days', isControlled: false, type: 'Tablet', instructions: 'Take in the morning with food' },
    ],
  ];

  let count = 0;
  for (let i = 0; i < Math.min(prescriptions.length, medicationSets.length); i++) {
    const prescription = prescriptions[i];
    const meds = medicationSets[i] || medicationSets[0];
    const existing = await prisma.prescriptionMedication.count({
      where: { prescriptionId: prescription.id },
    });
    if (existing > 0) continue;
    for (const med of meds) {
      await prisma.prescriptionMedication.create({
        data: {
          prescriptionId: prescription.id,
          ...med,
        },
      });
      count++;
    }
  }
  console.log(`Created ${count} prescription medications`);
}

async function seedPrescriptionPrecautions(prescriptions) {
  console.log('Seeding prescription precautions...');

  const precautionSets = [
    ['Avoid grapefruit while on amlodipine.', 'Do not stop suddenly; taper if discontinuing.'],
    ['Take with food to reduce stomach upset.', 'Monitor blood glucose regularly.'],
    ['Complete full course of antibiotics.', 'Avoid alcohol during treatment.'],
    ['May cause drowsiness; avoid driving until effect known.', 'Do not stop abruptly.'],
  ];

  let count = 0;
  for (let i = 0; i < Math.min(prescriptions.length, precautionSets.length); i++) {
    const prescription = prescriptions[i];
    const texts = precautionSets[i] || precautionSets[0];
    const existing = await prisma.prescriptionPrecaution.count({
      where: { prescriptionId: prescription.id },
    });
    if (existing > 0) continue;
    for (const text of texts) {
      await prisma.prescriptionPrecaution.create({
        data: { prescriptionId: prescription.id, text },
      });
      count++;
    }
  }
  console.log(`Created ${count} prescription precautions`);
}

async function seedPrescriptionDiets(prescriptions) {
  console.log('Seeding prescription diet recommendations...');

  const dietSets = [
    ['Low sodium diet (< 2g/day).', 'Limit alcohol.'],
    ['Balanced diet; limit simple sugars.', 'Regular meal times.'],
    ['Light diet; plenty of fluids.', null],
    ['Avoid caffeine in the evening.', 'Regular sleep schedule.'],
  ];

  let count = 0;
  for (let i = 0; i < Math.min(prescriptions.length, dietSets.length); i++) {
    const prescription = prescriptions[i];
    const texts = (dietSets[i] || dietSets[0]).filter(Boolean);
    const existing = await prisma.prescriptionDiet.count({
      where: { prescriptionId: prescription.id },
    });
    if (existing > 0) continue;
    for (const text of texts) {
      await prisma.prescriptionDiet.create({
        data: { prescriptionId: prescription.id, text },
      });
      count++;
    }
  }
  console.log(`Created ${count} prescription diet recommendations`);
}

async function seedMedicalDocuments() {
  console.log('Seeding medical documents...');

  const docTypes = ['LAB_REPORT', 'RADIOLOGY', 'CONSULTATION_NOTES', 'LAB_REPORT', 'OTHER'];
  const names = [
    'CBC and Metabolic Panel - Jan 2025',
    'Chest X-Ray - Feb 2025',
    'Consultation summary - Dr. Smith',
    'HbA1c and Lipid Panel',
    'Patient consent form',
  ];
  const descriptions = [
    'Complete blood count and basic metabolic panel.',
    'Chest X-ray PA and lateral.',
    'Summary of video consultation.',
    'Diabetes and cardiovascular risk markers.',
    'General consent for treatment.',
  ];

  const created = [];
  for (let i = 0; i < 5; i++) {
    const patientId = SAMPLE_PATIENT_IDS[i % SAMPLE_PATIENT_IDS.length];
    const doc = await prisma.medicalDocument.create({
      data: {
        patientId,
        doctorId: SAMPLE_DOCTOR_ID,
        appointmentId: i < 3 ? SAMPLE_APPOINTMENT_IDS[i % SAMPLE_APPOINTMENT_IDS.length] : null,
        consultationId: i === 2 ? SAMPLE_CONSULTATION_IDS[0] : null,
        name: names[i],
        type: docTypes[i],
        filePath: `/uploads/patients/${patientId}/${String(Date.now()).slice(-6)}-doc-${i + 1}.pdf`,
        fileSize: 1024 * (100 + i * 50),
        mimeType: 'application/pdf',
        uploadedBy: SAMPLE_DOCTOR_ID,
        description: descriptions[i],
      },
    });
    created.push(doc);
  }
  console.log(`Created ${created.length} medical documents`);
}

async function main() {
  try {
    console.log('Starting medical records seed...');

    const prescriptions = await seedPrescriptions();
    await seedPrescriptionMedications(prescriptions);
    await seedPrescriptionPrecautions(prescriptions);
    await seedPrescriptionDiets(prescriptions);
    await seedMedicalDocuments();

    console.log('Medical records seed completed successfully!');
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
