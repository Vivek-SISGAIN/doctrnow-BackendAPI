const prisma = require('../prisma/prisma');
const prescriptionDocumentService = require('./prescription-document.service');
const prescriptionPdfService = require('./prescription-pdf.service');
const prescriptionNotificationService = require('./prescription-notification.service');

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
   * Create a new prescription.
   * data.doctorId = auth User id of the doctor (same as JWT sub), not profile Doctor record id.
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
   * Count prescriptions by doctor ID (for dashboard stats).
   * doctorId = auth User id of the doctor (JWT sub / user.id from doctor portal).
   */
  async countByDoctorId(doctorId, filters = {}) {
    const where = { doctorId };
    if (filters.lifecycle) {
      where.lifecycle = filters.lifecycle;
    }
    return prisma.prescription.count({ where });
  }

  /**
   * Find prescriptions by doctor ID.
   * doctorId = auth User id of the doctor (JWT sub / user.id from doctor portal), not profile Doctor record id.
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
    console.log(`[PrescriptionService] Entering send method for prescription ID: ${id}`);
    const prescription = await prisma.prescription.findUnique({
      where: { id }
    });

    if (!prescription) {
      console.error(`[PrescriptionService] Send failed: Prescription ${id} not found`);
      throw new Error('Prescription not found');
    }

    if (prescription.lifecycle !== 'SIGNED') {
      console.warn(`[PrescriptionService] Send skipped: Prescription ${id} is in ${prescription.lifecycle} state, not SIGNED`);
      throw new Error('Only signed prescriptions can be sent');
    }

    const emailEnabled = String(process.env.PRESCRIPTION_EMAIL_ENABLED || 'false').trim().toLowerCase() === 'true';
    console.log(`[PrescriptionService] Prescription email enabled: ${emailEnabled}`);

    if (emailEnabled) {
      console.log(`[PrescriptionService] Building document model for prescription ${id}...`);
      const documentModel = await prescriptionDocumentService.buildDocumentModel(id);
      console.log(`[PrescriptionService] Document model built successfully for Rx ${documentModel.prescription.rxId}`);

      console.log(`[PrescriptionService] Generating PDF buffer for Rx ${documentModel.prescription.rxId}...`);
      const pdfBuffer = await prescriptionPdfService.generate(documentModel);
      console.log(`[PrescriptionService] PDF buffer generated (${pdfBuffer.length} bytes)`);

      if (!documentModel.patient.email) {
        console.error(`[PrescriptionService] Send failed: Patient email is missing for Rx ${documentModel.prescription.rxId}`);
        throw new Error('Patient email is missing; cannot send prescription email');
      }

      console.log(`[PrescriptionService] Calling notification service (background) for Rx ${documentModel.prescription.rxId}`);
      // Fire and forget (don't await) to prevent Gateway timeout
      prescriptionNotificationService.sendPrescriptionEmail({
        to: documentModel.patient.email,
        patientName: documentModel.patient.patient,
        doctorName: documentModel.doctor.name,
        facilityName: documentModel.facility.name,
        rxId: documentModel.prescription.rxId,
        pdfBuffer,
      }).catch(err => {
        console.error(`[PrescriptionService] Background notification failed for Rx ${documentModel.prescription.rxId}:`, err);
      });
      console.log(`[PrescriptionService] Notification triggered for Rx ${documentModel.prescription.rxId}`);
    } else {
      console.log('[PrescriptionService] Prescription email skipped because PRESCRIPTION_EMAIL_ENABLED=false', {
        prescriptionId: id,
        patientId: prescription.patientId,
      });
    }

    console.log(`[PrescriptionService] Updating prescription ${id} status to SENT...`);
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
