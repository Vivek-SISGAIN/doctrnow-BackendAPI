/* eslint-disable no-console */
require('dotenv').config();
const prisma = require('./prisma/prisma');

// Match doctor portal logged-in doctor so Lab Reports and Prescriptions show data
const SAMPLE_DOCTOR_ID = process.env.SAMPLE_DOCTOR_ID || '11111111-1111-1111-1111-111111111111';
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
  console.log('Seeding medical documents (incl. lab reports for doctor portal)...');

  const docTypes = ['LAB_REPORT', 'LAB_REPORT', 'RADIOLOGY', 'CONSULTATION_NOTES', 'LAB_REPORT', 'OTHER'];
  const names = [
    'CBC and Metabolic Panel - Jan 2025',
    'HbA1c and Lipid Panel',
    'Chest X-Ray - Feb 2025',
    'Consultation summary - Dr. Smith',
    'Thyroid Panel and LFT',
    'Patient consent form',
  ];
  const descriptions = [
    'Complete blood count and basic metabolic panel.',
    'Diabetes and cardiovascular risk markers.',
    'Chest X-ray PA and lateral.',
    'Summary of video consultation.',
    'Thyroid function and liver function tests.',
    'General consent for treatment.',
  ];

  const created = [];
  for (let i = 0; i < 6; i++) {
    const patientId = SAMPLE_PATIENT_IDS[i % SAMPLE_PATIENT_IDS.length];
    const filePath = docTypes[i] === 'LAB_REPORT' || docTypes[i] === 'RADIOLOGY'
      ? `/uploads/patients/${patientId}/${String(Date.now()).slice(-6)}-doc-${i + 1}.pdf`
      : '';
    const fileSize = filePath ? 1024 * (100 + i * 50) : 0;
    const doc = await prisma.medicalDocument.create({
      data: {
        patientId,
        doctorId: SAMPLE_DOCTOR_ID,
        appointmentId: i < 3 ? SAMPLE_APPOINTMENT_IDS[i % SAMPLE_APPOINTMENT_IDS.length] : null,
        consultationId: i === 3 ? SAMPLE_CONSULTATION_IDS[0] : null,
        name: names[i],
        type: docTypes[i],
        filePath: filePath || '',
        fileSize,
        mimeType: filePath ? 'application/pdf' : null,
        uploadedBy: SAMPLE_DOCTOR_ID,
        description: descriptions[i],
      },
    });
    created.push(doc);
  }
  console.log(`Created ${created.length} medical documents`);
}

async function seedLabReports() {
  console.log('Seeding lab reports (UI-shaped)...');

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const reportsData = [
    {
      patientId: SAMPLE_PATIENT_IDS[0],
      doctorId: SAMPLE_DOCTOR_ID,
      reportId: 'LAB-2024-001234-001',
      consultationDate: twoDaysAgo,
      consultationTime: '09:00 AM',
      orderedTests: ['Complete Blood Count', 'Lipid Profile', 'HbA1c'],
      status: 'COMPLETED',
      priority: 'ROUTINE',
      resultDate: twoDaysAgo,
      notes: 'Routine follow-up labs',
      isReviewed: false,
      results: [
        { name: 'Hemoglobin', value: '12.5', unit: 'g/dL', referenceRange: '12.0-16.0', flag: 'normal' },
        { name: 'WBC', value: '7.2', unit: 'x10³/µL', referenceRange: '4.5-11.0', flag: 'normal' },
        { name: 'Total Cholesterol', value: '220', unit: 'mg/dL', referenceRange: '<200', flag: 'abnormal', previousValue: '210', previousDate: '2024-09-15' },
        { name: 'HbA1c', value: '6.8', unit: '%', referenceRange: '<5.7', flag: 'abnormal', previousValue: '6.5', previousDate: '2024-09-15' },
      ],
    },
    {
      patientId: SAMPLE_PATIENT_IDS[0],
      doctorId: SAMPLE_DOCTOR_ID,
      reportId: 'LAB-2024-001234-002',
      consultationDate: twoDaysAgo,
      consultationTime: '10:30 AM',
      orderedTests: ['Lipid Profile', 'HbA1c', 'Fasting Glucose'],
      status: 'SENT',
      priority: 'ROUTINE',
      resultDate: yesterday,
      notes: null,
      isReviewed: true,
      reviewedAt: yesterday,
      reviewComments: 'Pre-diabetes confirmed. Lifestyle modifications advised.',
      sentToPatient: true,
      sentAt: yesterday,
      results: [
        { name: 'Total Cholesterol', value: '210', unit: 'mg/dL', referenceRange: '<200', flag: 'abnormal' },
        { name: 'HbA1c', value: '6.5', unit: '%', referenceRange: '<5.7', flag: 'abnormal' },
        { name: 'Fasting Glucose', value: '118', unit: 'mg/dL', referenceRange: '70-100', flag: 'abnormal' },
      ],
    },
    {
      patientId: SAMPLE_PATIENT_IDS[1],
      doctorId: SAMPLE_DOCTOR_ID,
      reportId: 'LAB-2024-001235-001',
      consultationDate: twoDaysAgo,
      consultationTime: '10:30 AM',
      orderedTests: ['Cardiac Enzymes', 'BNP', 'Troponin'],
      status: 'COMPLETED',
      priority: 'STAT',
      resultDate: twoDaysAgo,
      notes: null,
      isReviewed: false,
      results: [
        { name: 'Troponin I', value: '2.8', unit: 'ng/mL', referenceRange: '<0.04', flag: 'critical', previousValue: '0.02', previousDate: '2024-11-10' },
        { name: 'BNP', value: '450', unit: 'pg/mL', referenceRange: '<100', flag: 'critical', previousValue: '85', previousDate: '2024-11-10' },
      ],
    },
    {
      patientId: SAMPLE_PATIENT_IDS[2],
      doctorId: SAMPLE_DOCTOR_ID,
      reportId: 'LAB-2024-001236-001',
      consultationDate: yesterday,
      consultationTime: '02:00 PM',
      orderedTests: ['Thyroid Panel'],
      status: 'IN_PROGRESS',
      priority: 'ROUTINE',
      resultDate: null,
      notes: null,
      isReviewed: false,
      results: null,
    },
    {
      patientId: SAMPLE_PATIENT_IDS[3],
      doctorId: SAMPLE_DOCTOR_ID,
      reportId: 'LAB-2024-001237-001',
      consultationDate: twoDaysAgo,
      consultationTime: '11:00 AM',
      orderedTests: ['Liver Function Test', 'Kidney Function Test'],
      status: 'COMPLETED',
      priority: 'ROUTINE',
      resultDate: yesterday,
      notes: null,
      isReviewed: true,
      reviewedAt: yesterday,
      reviewComments: 'Elevated ALT noted. Recommend hepatology referral.',
      sentToPatient: false,
      sentAt: null,
      results: [
        { name: 'ALT', value: '85', unit: 'U/L', referenceRange: '7-56', flag: 'abnormal' },
        { name: 'AST', value: '42', unit: 'U/L', referenceRange: '10-40', flag: 'abnormal' },
        { name: 'Creatinine', value: '1.1', unit: 'mg/dL', referenceRange: '0.7-1.3', flag: 'normal' },
      ],
    },
  ];

  for (const r of reportsData) {
    await prisma.labReport.upsert({
      where: { reportId: r.reportId },
      update: {},
      create: {
        patientId: r.patientId,
        doctorId: r.doctorId,
        reportId: r.reportId,
        consultationDate: r.consultationDate,
        consultationTime: r.consultationTime,
        orderedTests: r.orderedTests,
        status: r.status,
        priority: r.priority,
        resultDate: r.resultDate,
        notes: r.notes,
        results: r.results,
        isReviewed: r.isReviewed,
        reviewedAt: r.reviewedAt,
        reviewComments: r.reviewComments,
        sentToPatient: r.sentToPatient ?? false,
        sentAt: r.sentAt,
      },
    });
  }
  console.log(`Created/updated ${reportsData.length} lab reports`);
}

async function main() {
  try {
    console.log('Starting medical records seed...');

    const prescriptions = await seedPrescriptions();
    await seedPrescriptionMedications(prescriptions);
    await seedPrescriptionPrecautions(prescriptions);
    await seedPrescriptionDiets(prescriptions);
    await seedMedicalDocuments();
    await seedLabReports();

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
