const prisma = require('../prisma/prisma');

class PrescriptionService {
  /**
   * Generate unique RX ID
   */
  generateRxId() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `RX-${year}-${month}${day}-${random}`;
  }

  /**
   * Create a new prescription
   */
  async create(data) {
    const rxId = this.generateRxId();

    const prescription = await prisma.prescription.create({
      data: {
        appointmentId: data.appointmentId,
        consultationId: data.consultationId,
        patientId: data.patientId,
        doctorId: data.doctorId,
        rxId,
        diagnosis: data.diagnosis,
        lifecycle: 'DRAFT',
        medications: {
          create: data.medications || []
        },
        precautions: {
          create: (data.precautions || []).map(text => ({ text }))
        },
        dietRecommendations: {
          create: (data.dietRecommendations || []).map(text => ({ text }))
        }
      },
      include: {
        medications: true,
        precautions: true,
        dietRecommendations: true
      }
    });

    return prescription;
  }

  /**
   * Find prescription by ID
   */
  async findById(id) {
    const prescription = await prisma.prescription.findUnique({
      where: { id },
      include: {
        medications: true,
        precautions: true,
        dietRecommendations: true
      }
    });

    return prescription;
  }

  /**
   * Find prescription by RX ID
   */
  async findByRxId(rxId) {
    const prescription = await prisma.prescription.findUnique({
      where: { rxId },
      include: {
        medications: true,
        precautions: true,
        dietRecommendations: true
      }
    });

    return prescription;
  }

  /**
   * Find prescriptions by patient ID
   */
  async findByPatientId(patientId, filters = {}) {
    const { lifecycle, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where = { patientId };
    if (lifecycle) {
      where.lifecycle = lifecycle;
    }

    const [prescriptions, total] = await Promise.all([
      prisma.prescription.findMany({
        where,
        include: {
          medications: true,
          precautions: true,
          dietRecommendations: true
        },
        skip,
        take: parseInt(limit, 10),
        orderBy: {
          createdAt: 'desc'
        }
      }),
      prisma.prescription.count({ where })
    ]);

    return {
      prescriptions,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Find prescriptions by doctor ID
   */
  async findByDoctorId(doctorId, filters = {}) {
    const { lifecycle, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where = { doctorId };
    if (lifecycle) {
      where.lifecycle = lifecycle;
    }

    const [prescriptions, total] = await Promise.all([
      prisma.prescription.findMany({
        where,
        include: {
          medications: true,
          precautions: true,
          dietRecommendations: true
        },
        skip,
        take: parseInt(limit, 10),
        orderBy: {
          createdAt: 'desc'
        }
      }),
      prisma.prescription.count({ where })
    ]);

    return {
      prescriptions,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Update prescription
   */
  async update(id, data) {
    const prescription = await prisma.prescription.findUnique({
      where: { id }
    });

    if (!prescription) {
      throw new Error('Prescription not found');
    }

    // Update medications if provided
    if (data.medications) {
      // Delete existing medications
      await prisma.prescriptionMedication.deleteMany({
        where: { prescriptionId: id }
      });
      // Create new medications
      await prisma.prescriptionMedication.createMany({
        data: data.medications.map(med => ({
          prescriptionId: id,
          ...med
        }))
      });
    }

    // Update precautions if provided
    if (data.precautions) {
      await prisma.prescriptionPrecaution.deleteMany({
        where: { prescriptionId: id }
      });
      await prisma.prescriptionPrecaution.createMany({
        data: data.precautions.map(text => ({
          prescriptionId: id,
          text
        }))
      });
    }

    // Update diet recommendations if provided
    if (data.dietRecommendations) {
      await prisma.prescriptionDiet.deleteMany({
        where: { prescriptionId: id }
      });
      await prisma.prescriptionDiet.createMany({
        data: data.dietRecommendations.map(text => ({
          prescriptionId: id,
          text
        }))
      });
    }

    // Update prescription fields
    const updateData = {};
    if (data.diagnosis !== undefined) updateData.diagnosis = data.diagnosis;
    if (data.lifecycle !== undefined) updateData.lifecycle = data.lifecycle;
    if (data.signedAt !== undefined) updateData.signedAt = data.signedAt;
    if (data.sentAt !== undefined) updateData.sentAt = data.sentAt;
    if (data.viewedAt !== undefined) updateData.viewedAt = data.viewedAt;

    const updated = await prisma.prescription.update({
      where: { id },
      data: updateData,
      include: {
        medications: true,
        precautions: true,
        dietRecommendations: true
      }
    });

    return updated;
  }

  /**
   * Sign prescription (DRAFT → SIGNED)
   */
  async sign(id) {
    const prescription = await prisma.prescription.findUnique({
      where: { id }
    });

    if (!prescription) {
      throw new Error('Prescription not found');
    }

    if (prescription.lifecycle !== 'DRAFT') {
      throw new Error('Only draft prescriptions can be signed');
    }

    return await prisma.prescription.update({
      where: { id },
      data: {
        lifecycle: 'SIGNED',
        signedAt: new Date()
      },
      include: {
        medications: true,
        precautions: true,
        dietRecommendations: true
      }
    });
  }

  /**
   * Send prescription (SIGNED → SENT)
   */
  async send(id) {
    const prescription = await prisma.prescription.findUnique({
      where: { id }
    });

    if (!prescription) {
      throw new Error('Prescription not found');
    }

    if (prescription.lifecycle !== 'SIGNED') {
      throw new Error('Only signed prescriptions can be sent');
    }

    return await prisma.prescription.update({
      where: { id },
      data: {
        lifecycle: 'SENT',
        sentAt: new Date()
      },
      include: {
        medications: true,
        precautions: true,
        dietRecommendations: true
      }
    });
  }

  /**
   * Mark prescription as viewed (SENT → VIEWED)
   */
  async markAsViewed(id) {
    const prescription = await prisma.prescription.findUnique({
      where: { id }
    });

    if (!prescription) {
      throw new Error('Prescription not found');
    }

    if (prescription.lifecycle !== 'SENT') {
      throw new Error('Only sent prescriptions can be marked as viewed');
    }

    return await prisma.prescription.update({
      where: { id },
      data: {
        lifecycle: 'VIEWED',
        viewedAt: new Date()
      },
      include: {
        medications: true,
        precautions: true,
        dietRecommendations: true
      }
    });
  }

  /**
   * Delete prescription
   */
  async delete(id) {
    const prescription = await prisma.prescription.findUnique({
      where: { id }
    });

    if (!prescription) {
      throw new Error('Prescription not found');
    }

    await prisma.prescription.delete({
      where: { id }
    });

    return { message: 'Prescription deleted successfully' };
  }
}

module.exports = new PrescriptionService();
