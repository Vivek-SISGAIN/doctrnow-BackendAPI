const prisma = require('../prisma/prisma');

class ConsultationService {
  /**
   * Create a new consultation
   */
  async create(data) {
    const consultation = await prisma.consultation.create({
      data: {
        appointmentId: data.appointmentId,
        patientId: data.patientId,
        doctorId: data.doctorId,
        status: data.status || 'PENDING',
        type: data.type || 'VIDEO',
        diagnosis: data.diagnosis,
        followUp: data.followUp
      },
      include: {
        notes: {
          orderBy: {
            createdAt: 'desc'
          }
        },
        vitals: true
      }
    });

    return consultation;
  }

  /**
   * Find consultation by ID
   */
  async findById(id) {
    const consultation = await prisma.consultation.findUnique({
      where: { id },
      include: {
        notes: {
          orderBy: {
            createdAt: 'desc'
          }
        },
        vitals: true
      }
    });

    return consultation;
  }

  /**
   * Find consultation by appointment ID
   */
  async findByAppointmentId(appointmentId) {
    const consultation = await prisma.consultation.findUnique({
      where: { appointmentId },
      include: {
        notes: {
          orderBy: {
            createdAt: 'desc'
          }
        },
        vitals: true
      }
    });

    return consultation;
  }

  /**
   * Start consultation
   */
  async start(appointmentId) {
    let consultation = await prisma.consultation.findUnique({
      where: { appointmentId }
    });

    if (!consultation) {
      // Create consultation if it doesn't exist
      consultation = await prisma.consultation.create({
        data: {
          appointmentId,
          patientId: '', // Should be fetched from appointment
          doctorId: '', // Should be fetched from appointment
          status: 'IN_PROGRESS',
          startedAt: new Date()
        }
      });
    } else {
      consultation = await prisma.consultation.update({
        where: { id: consultation.id },
        data: {
          status: 'IN_PROGRESS',
          startedAt: new Date()
        }
      });
    }

    return consultation;
  }

  /**
   * End consultation
   */
  async end(id) {
    const consultation = await prisma.consultation.findUnique({
      where: { id }
    });

    if (!consultation) {
      throw new Error('Consultation not found');
    }

    if (!consultation.startedAt) {
      throw new Error('Consultation has not been started');
    }

    const endedAt = new Date();
    const duration = Math.floor((endedAt - consultation.startedAt) / 1000); // Duration in seconds

    const updated = await prisma.consultation.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        endedAt,
        duration
      },
      include: {
        notes: {
          orderBy: {
            createdAt: 'desc'
          }
        },
        vitals: true
      }
    });

    return updated;
  }

  /**
   * Get consultation history by patient ID
   */
  async getHistoryByPatientId(patientId, filters = {}) {
    const { status, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where = { patientId };
    if (status) {
      where.status = status;
    }

    const [consultations, total] = await Promise.all([
      prisma.consultation.findMany({
        where,
        include: {
          notes: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 1 // Get only latest note for list view
          },
          vitals: true
        },
        skip,
        take: parseInt(limit, 10),
        orderBy: {
          startedAt: 'desc'
        }
      }),
      prisma.consultation.count({ where })
    ]);

    return {
      consultations,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get consultation history by doctor ID
   */
  async getHistoryByDoctorId(doctorId, filters = {}) {
    const { status, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit;

    const where = { doctorId };
    if (status) {
      where.status = status;
    }

    const [consultations, total] = await Promise.all([
      prisma.consultation.findMany({
        where,
        include: {
          notes: {
            orderBy: {
              createdAt: 'desc'
            },
            take: 1 // Get only latest note for list view
          },
          vitals: true
        },
        skip,
        take: parseInt(limit, 10),
        orderBy: {
          startedAt: 'desc'
        }
      }),
      prisma.consultation.count({ where })
    ]);

    return {
      consultations,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Update consultation
   */
  async update(id, data) {
    const consultation = await prisma.consultation.findUnique({
      where: { id }
    });

    if (!consultation) {
      throw new Error('Consultation not found');
    }

    const updateData = {};
    if (data.status !== undefined) updateData.status = data.status;
    if (data.diagnosis !== undefined) updateData.diagnosis = data.diagnosis;
    if (data.followUp !== undefined) updateData.followUp = data.followUp;
    if (data.type !== undefined) updateData.type = data.type;

    const updated = await prisma.consultation.update({
      where: { id },
      data: updateData,
      include: {
        notes: {
          orderBy: {
            createdAt: 'desc'
          }
        },
        vitals: true
      }
    });

    return updated;
  }

  /**
   * Mark consultation as no-show
   */
  async markNoShow(id, reason) {
    const consultation = await prisma.consultation.findUnique({
      where: { id }
    });

    if (!consultation) {
      throw new Error('Consultation not found');
    }

    const updated = await prisma.consultation.update({
      where: { id },
      data: {
        status: 'NO_SHOW',
        endedAt: new Date()
      },
      include: {
        notes: {
          orderBy: {
            createdAt: 'desc'
          }
        },
        vitals: true
      }
    });

    return updated;
  }
}

module.exports = new ConsultationService();
