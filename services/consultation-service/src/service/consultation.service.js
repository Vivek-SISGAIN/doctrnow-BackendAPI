const prisma = require('../prisma/prisma');
const consultationVitalsService = require('./consultation-vitals.service');

class ConsultationService {
  /**
   * Create a new consultation
   */
  async create(data) {
    const consultation = await prisma.consultation.upsert({
      where: { appointmentId: data.appointmentId },
      update: {
        patientId: data.patientId,
        doctorId: data.doctorId,
        hospitalId: data.hospitalId ?? undefined,
        status: data.status || 'PENDING',
        type: data.type || 'VIDEO',
        diagnosis: data.diagnosis,
        followUp: data.followUp,
        patientAuthId: data.patientAuthId,
        doctorAuthId: data.doctorAuthId,
      },
      create: {
        appointmentId: data.appointmentId,
        patientId: data.patientId,
        doctorId: data.doctorId,
        hospitalId: data.hospitalId,
        status: data.status || 'PENDING',
        type: data.type || 'VIDEO',
        diagnosis: data.diagnosis,
        followUp: data.followUp,
        patientAuthId: data.patientAuthId,
        doctorAuthId: data.doctorAuthId,
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
   * Find consultation by appointment ID. Ensures channelName is set (for Agora) even for older records.
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
    if (!consultation) return null;
    const channelName = consultation.channelName || `appointment-${appointmentId}`;
    return { ...consultation, channelName };
  }

  /**
   * Patient joins lobby: get-or-create consultation, set patientJoinedAt and channelName (Agora).
   * Caller must pass patientId and doctorId (from appointment). Returns consultation + channelName for Agora.
   */
  async joinLobby(appointmentId, patientId, doctorId) {
    let consultation = await prisma.consultation.findUnique({
      where: { appointmentId },
      include: { notes: true, vitals: true }
    });

    const channelName = `appointment-${appointmentId}`;
    const now = new Date();
    if (!consultation) {
      consultation = await prisma.consultation.create({
        data: {
          appointmentId,
          patientId,
          doctorId,
          hospitalId: null,
          status: 'PENDING',
          type: 'VIDEO',
          patientJoinedAt: now,
        },
        include: { notes: true, vitals: true }
      });
    } else {
      consultation = await prisma.consultation.update({
        where: { id: consultation.id },
        data: { patientJoinedAt: now },
        include: { notes: true, vitals: true }
      });
    }
    // Persist channelName via raw SQL so it's saved regardless of Prisma client version (column: migration 20260211100000_add_channel_name)
    try {
      await prisma.$executeRawUnsafe(
        'UPDATE consultations SET "channelName" = $1 WHERE id = $2',
        channelName,
        consultation.id
      );
    } catch (e) {
      console.warn('ConsultationService.joinLobby: persist channelName failed (run migration 20260211100000_add_channel_name):', e?.message);
    }
    return { consultation: { ...consultation, channelName }, channelName };
  }

  /**
   * Ensure consultation exists for appointment (get-or-create without setting patientJoinedAt),
   * then save health details (vitals). Used when patient adds health details post-payment or before call.
   * Body: { patientId, doctorId, weight, height, bloodPressure, sugarLevel, consultationReason }
   */
  async ensureConsultationAndSaveHealthDetails(appointmentId, patientId, doctorId, vitalsData) {
    let consultation = await prisma.consultation.findUnique({
      where: { appointmentId },
      include: { notes: true, vitals: true }
    });

    if (!consultation) {
      consultation = await prisma.consultation.create({
        data: {
          appointmentId,
          patientId,
          doctorId,
          hospitalId: vitalsData.hospitalId || null,
          status: 'PENDING',
          type: 'VIDEO',
        },
        include: { notes: true, vitals: true }
      });
    }

    if (vitalsData.hospitalId && consultation.hospitalId !== vitalsData.hospitalId) {
      consultation = await prisma.consultation.update({
        where: { id: consultation.id },
        data: { hospitalId: vitalsData.hospitalId },
        include: { notes: true, vitals: true }
      });
    }

    const { weight, height, bloodPressure, temperature, pulse, spo2, sugarLevel, consultationReason, allergies, criticalConditions, medications, lifestyleHabits } = vitalsData;
    const notesParts = [];
    if (sugarLevel) notesParts.push(`Blood sugar: ${sugarLevel} mg/dL`);
    if (consultationReason) notesParts.push(`Reason for consultation: ${consultationReason}`);
    const notes = notesParts.length > 0 ? notesParts.join('. ') : null;

    const vitals = await consultationVitalsService.upsert(consultation.id, {
      weight: weight || null,
      height: height || null,
      bloodPressure: bloodPressure || null,
      temperature: temperature || null,
      pulse: pulse || null,
      spo2: spo2 || null,
      notes,
      allergies: allergies || null,
      criticalConditions: criticalConditions || null,
      medications: medications || null,
      lifestyleHabits: lifestyleHabits || null
    });

    return { consultation: { ...consultation, vitals }, vitals };
  }

  /**
   * Get health details (vitals) for an appointment's consultation, if any.
   */
  async getHealthDetailsByAppointmentId(appointmentId) {
    const consultation = await prisma.consultation.findUnique({
      where: { appointmentId },
      include: { vitals: true }
    });
    return consultation?.vitals || null;
  }

  /**
   * Doctor requests consent: set consentRequestedAt.
   */
  async requestConsent(appointmentId) {
    const consultation = await prisma.consultation.findUnique({
      where: { appointmentId }
    });
    if (!consultation) {
      throw new Error('Consultation not found. Patient must join the lobby first.');
    }
    return prisma.consultation.update({
      where: { id: consultation.id },
      data: { consentRequestedAt: new Date() },
      include: { notes: true, vitals: true }
    });
  }

  /**
   * Patient accepts consent: set consentAcceptedAt.
   */
  async acceptConsent(appointmentId) {
    const consultation = await prisma.consultation.findUnique({
      where: { appointmentId }
    });
    if (!consultation) {
      throw new Error('Consultation not found.');
    }
    return prisma.consultation.update({
      where: { id: consultation.id },
      data: { consentAcceptedAt: new Date() },
      include: { notes: true, vitals: true }
    });
  }

  /**
   * Start consultation (doctor joins call). Consultation must already exist (patient joined lobby).
   */
  async start(appointmentId) {
    const consultation = await prisma.consultation.findUnique({
      where: { appointmentId },
      include: { notes: true, vitals: true }
    });

    if (!consultation) {
      throw new Error('Consultation not found. Ask the patient to join the lobby first.');
    }

    return prisma.consultation.update({
      where: { id: consultation.id },
      data: {
        status: 'IN_PROGRESS',
        startedAt: new Date()
      },
      include: { notes: true, vitals: true }
    });
  }

  /**
   * End consultation by appointment ID (for doctor/patient "End call").
   * Allows ending even if not formally started (e.g. quick leave).
   * Returns { consultation, endedBy }.
   */
  async endByAppointment(appointmentId, endedBy) {
    const consultation = await prisma.consultation.findUnique({
      where: { appointmentId }
    });

    if (!consultation) {
      throw new Error('Consultation not found');
    }

    const endedAt = new Date();
    const startedAt = consultation.startedAt || consultation.patientJoinedAt || consultation.createdAt;
    const duration = startedAt ? Math.floor((endedAt - new Date(startedAt)) / 1000) : 0;

    const updated = await prisma.consultation.update({
      where: { id: consultation.id },
      data: {
        status: 'COMPLETED',
        endedAt,
        duration
      },
      include: {
        notes: { orderBy: { createdAt: 'desc' } },
        vitals: true
      }
    });

    return { consultation: updated, endedBy };
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
   * @param {string} doctorId
   * @param {Object} filters - { status, page, limit, startDate (ISO), endDate (ISO) }
   */
  async getHistoryByDoctorId(doctorId, filters = {}) {
    const { status, page = 1, limit = 20, startDate, endDate } = filters;
    const skip = (page - 1) * limit;

    const where = { doctorId };
    if (status) {
      where.status = status;
    }
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      const dateRange = {};
      if (start) dateRange.gte = start;
      if (end) dateRange.lte = end;
      where.OR = [
        { startedAt: { not: null, ...dateRange } },
        { startedAt: null, createdAt: dateRange }
      ];
    }

    const [consultations, total] = await Promise.all([
      prisma.consultation.findMany({
        where,
        include: {
          notes: {
            orderBy: {
              createdAt: 'desc'
            }
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
    if (data.hospitalId !== undefined) updateData.hospitalId = data.hospitalId;
    if (data.patientAuthId !== undefined) updateData.patientAuthId = data.patientAuthId;
    if (data.doctorAuthId !== undefined) updateData.doctorAuthId = data.doctorAuthId;

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
  /**
   * Find consultations by an array of IDs or appointment IDs
   */
  async findByIds(ids) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) return [];

    return prisma.consultation.findMany({
      where: {
        OR: [
          { id: { in: ids } },
          { appointmentId: { in: ids } }
        ]
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
  }
}

module.exports = new ConsultationService();
