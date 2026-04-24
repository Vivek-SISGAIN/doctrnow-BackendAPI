const prisma = require('../prisma/prisma');

class PatientHealthService {
  /**
   * Find health profile by patientId
   */
  findByPatientId(patientId) {
    return prisma.patientHealthProfile.findUnique({
      where: { patientId }
    });
  }

  /**
   * Find health profile by userId
   */
  async findByUserId(userId) {
    const patient = await prisma.patient.findUnique({
      where: { userId },
      select: { id: true }
    });

    if (!patient) return null;

    return prisma.patientHealthProfile.findUnique({
      where: { patientId: patient.id }
    });
  }

  /**
   * Create or update health profile for a user
   */
  async upsertByUserId(userId, data) {
    const patient = await prisma.patient.findUnique({
      where: { userId },
      select: { id: true }
    });

    if (!patient) {
      throw new Error('Patient profile not found for this user');
    }

    return prisma.patientHealthProfile.upsert({
      where: { patientId: patient.id },
      update: {
        weight: data.weight,
        height: data.height,
        bloodPressure: data.bloodPressure,
        sugarLevel: data.sugarLevel,
        temperature: data.temperature,
        pulse: data.pulse,
        spo2: data.spo2,
        allergies: data.allergies || [],
        conditions: data.conditions || [],
        medications: data.medications || [],
        lifestyleHabits: data.lifestyleHabits
      },
      create: {
        patientId: patient.id,
        weight: data.weight,
        height: data.height,
        bloodPressure: data.bloodPressure,
        sugarLevel: data.sugarLevel,
        temperature: data.temperature,
        pulse: data.pulse,
        spo2: data.spo2,
        allergies: data.allergies || [],
        conditions: data.conditions || [],
        medications: data.medications || [],
        lifestyleHabits: data.lifestyleHabits
      }
    });
  }
}

module.exports = new PatientHealthService();
