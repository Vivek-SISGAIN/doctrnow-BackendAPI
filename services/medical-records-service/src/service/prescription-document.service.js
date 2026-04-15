const prisma = require('../prisma/prisma');

const PROFILE_SERVICE_URL = process.env.PROFILE_SERVICE_URL || 'http://localhost:5000';
const CONSULTATION_SERVICE_URL = process.env.CONSULTATION_SERVICE_URL || 'http://localhost:3005';
const SUPER_ADMIN_SERVICE_URL = process.env.SUPER_ADMIN_SERVICE_URL || 'http://localhost:5001';

const DEFAULT_FACILITY = {
  name: 'DoctrNow Medical Center',
  license: 'DHA-F-0001234',
  address: 'Healthcare City, Building A, Dubai, UAE',
  phone: '+971 4 123 4567',
  email: 'info@doctrnow.ae',
};

function safeJoin(parts, separator = ' ') {
  return parts.filter(Boolean).join(separator).trim();
}

function formatBloodGroup(value) {
  if (!value) return undefined;
  return value.replace('_POS', '+').replace('_NEG', '-').replace('_', '');
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.warn('[PrescriptionDocumentService] Failed to fetch resource', {
      url,
      error: error.message,
    });
    return null;
  }
}

class PrescriptionDocumentService {
  async fetchPatient(patientId) {
    const result = await fetchJson(
      `${PROFILE_SERVICE_URL}/api/patients/${encodeURIComponent(patientId)}`
    );
    return result?.data ?? null;
  }

  async fetchDoctor(doctorId) {
    const result = await fetchJson(
      `${PROFILE_SERVICE_URL}/api/doctors/${encodeURIComponent(doctorId)}`
    );
    return result?.data ?? null;
  }

  async fetchHealthDetails(appointmentId) {
    if (!appointmentId) return null;
    const result = await fetchJson(
      `${CONSULTATION_SERVICE_URL}/api/consultations/appointment/${encodeURIComponent(
        appointmentId
      )}/health-details`
    );
    return result?.data ?? result ?? null;
  }

  async fetchConsultationNotes(consultationId) {
    if (!consultationId) return [];
    const result = await fetchJson(
      `${CONSULTATION_SERVICE_URL}/api/consultation-notes/consultation/${encodeURIComponent(
        consultationId
      )}`
    );
    return result?.data ?? [];
  }

  async fetchHospital(hospitalId) {
    if (!hospitalId) return null;
    const result = await fetchJson(
      `${SUPER_ADMIN_SERVICE_URL}/api/super-admins/hospital/${encodeURIComponent(hospitalId)}`
    );
    return result?.data ?? null;
  }

  async buildDocumentModel(prescriptionId) {
    const prescription = await prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: {
        medications: true,
        precautions: true,
        dietRecommendations: true,
      },
    });
    if (!prescription) {
      throw new Error('Prescription not found');
    }

    const [patient, doctor, healthDetails, consultationNotes] = await Promise.all([
      this.fetchPatient(prescription.patientId),
      this.fetchDoctor(prescription.doctorId),
      this.fetchHealthDetails(prescription.appointmentId),
      this.fetchConsultationNotes(prescription.consultationId),
    ]);

    let hospital = null;
    if (doctor?.hospitalId) {
      hospital = await this.fetchHospital(doctor.hospitalId);
    }

    const doctorName =
      doctor?.fullName ||
      doctor?.name ||
      safeJoin([doctor?.firstName, doctor?.lastName]) ||
      'Doctor';

    const patientName =
      safeJoin([patient?.firstName, patient?.lastName]) ||
      patient?.fullName ||
      patient?.email ||
      `Patient ${String(prescription.patientId).slice(0, 8)}`;

    return {
      prescription: {
        id: prescription.id,
        rxId: prescription.rxId,
        consultationDate: prescription.createdAt,
        consultationTime: prescription.createdAt,
        diagnosis: prescription.diagnosis || '',
        lifecycle: String(prescription.lifecycle || 'DRAFT').toLowerCase(),
        signedAt: prescription.signedAt,
        sentAt: prescription.sentAt,
        medications: (prescription.medications || []).map((medication) => ({
          name: medication.name,
          strength: medication.strength,
          dosage: medication.dosage,
          frequency: medication.frequency,
          duration: medication.duration,
          isControlled: Boolean(medication.isControlled),
          instructions: medication.instructions || undefined,
        })),
        precautions: (prescription.precautions || []).map((item) => item.text).filter(Boolean),
        dietRecommendations: (prescription.dietRecommendations || [])
          .map((item) => item.text)
          .filter(Boolean),
      },
      patient: {
        id: patient?.id || prescription.patientId,
        patient: patientName,
        email: patient?.email || null,
        mrn: patient?.mrn || `MRN-${String(prescription.patientId).slice(0, 8)}`,
        gender: patient?.gender || undefined,
        dateOfBirth: patient?.dateOfBirth || undefined,
        emiratesId: patient?.emiratesId || undefined,
        bloodGroup: formatBloodGroup(patient?.bloodGroup),
        allergies: [],
      },
      doctor: {
        id: doctor?.id || prescription.doctorId,
        name: doctorName,
        specialty: doctor?.primarySpecialization || doctor?.specialization || 'General Physician',
        license: doctor?.licenseNumber || doctor?.license || '',
        signature: doctorName,
        medicalDegree: doctor?.medicalDegree || undefined,
        hospital:
          doctor?.hospitalName || doctor?.clinicName || doctor?.organizationName || undefined,
        email: doctor?.email || undefined,
      },
      facility: {
        name:
          hospital?.officialName ||
          doctor?.hospitalName ||
          doctor?.clinicName ||
          doctor?.organizationName ||
          DEFAULT_FACILITY.name,
        license:
          hospital?.dhaLicenseNumber ||
          doctor?.facilityLicenseNumber ||
          doctor?.hospitalLicenseNumber ||
          DEFAULT_FACILITY.license,
        address:
          hospital?.fullAddress ||
          doctor?.hospitalAddress ||
          doctor?.clinicAddress ||
          doctor?.organizationAddress ||
          DEFAULT_FACILITY.address,
        phone:
          hospital?.mobile ||
          doctor?.hospitalPhone ||
          doctor?.clinicPhone ||
          doctor?.organizationPhone ||
          DEFAULT_FACILITY.phone,
        email:
          hospital?.officialEmail ||
          doctor?.hospitalEmail ||
          doctor?.clinicEmail ||
          doctor?.organizationEmail ||
          DEFAULT_FACILITY.email,
      },
      vitals: healthDetails
        ? {
            bp: healthDetails.bp || healthDetails.bloodPressure || undefined,
            pulse: healthDetails.pulse || undefined,
            temp: healthDetails.temp || healthDetails.temperature || undefined,
            spo2: healthDetails.spo2 || undefined,
            weight: healthDetails.weight || undefined,
            height: healthDetails.height || undefined,
            preCallNotes: healthDetails.preCallNotes || healthDetails.notes || undefined,
          }
        : undefined,
      notes: (consultationNotes || [])
        .map((note) => note.content)
        .filter(Boolean)
        .join('\n\n') || undefined,
    };
  }
}

module.exports = new PrescriptionDocumentService();
