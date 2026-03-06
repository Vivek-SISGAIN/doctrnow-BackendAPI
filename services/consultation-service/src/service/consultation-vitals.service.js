const prisma = require('../prisma/prisma');

class ConsultationVitalsService {
  /**
   * Create or update vitals for a consultation
   */
  async upsert(consultationId, data) {
    const existing = await prisma.consultationVitals.findUnique({
      where: { consultationId }
    });

    if (existing) {
      // Update existing vitals
      return await prisma.consultationVitals.update({
        where: { consultationId },
        data: {
          bloodPressure: data.bloodPressure,
          pulse: data.pulse,
          temperature: data.temperature,
          spo2: data.spo2,
          weight: data.weight,
          height: data.height,
          notes: data.notes,
          allergies: data.allergies,
          criticalConditions: data.criticalConditions
        }
      });
    } else {
      // Create new vitals
      return await prisma.consultationVitals.create({
        data: {
          consultationId,
          bloodPressure: data.bloodPressure,
          pulse: data.pulse,
          temperature: data.temperature,
          spo2: data.spo2,
          weight: data.weight,
          height: data.height,
          notes: data.notes,
          allergies: data.allergies,
          criticalConditions: data.criticalConditions
        }
      });
    }
  }

  /**
   * Find vitals by consultation ID
   */
  async findByConsultationId(consultationId) {
    const vitals = await prisma.consultationVitals.findUnique({
      where: { consultationId }
    });

    return vitals;
  }

  /**
   * Delete vitals
   */
  async delete(consultationId) {
    const vitals = await prisma.consultationVitals.findUnique({
      where: { consultationId }
    });

    if (!vitals) {
      throw new Error('Vitals not found');
    }

    await prisma.consultationVitals.delete({
      where: { consultationId }
    });

    return { message: 'Vitals deleted successfully' };
  }
}

module.exports = new ConsultationVitalsService();
