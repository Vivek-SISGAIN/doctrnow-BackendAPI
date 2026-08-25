const prisma = require('../prisma/prisma');
const consultationVitalsService = require('./consultation-vitals.service');
const axios = require('axios');

const gatewayBaseUrl = () => {
  const base = process.env.BASE_URL || 'http://localhost:8080/api/v1/';
  return base.endsWith('/') ? base : `${base}/`;
};

const notifyAppointmentCompleted = (appointmentId) => {
  if (!appointmentId) return;

  (async () => {
    try {
      const response = await fetch(`${gatewayBaseUrl()}appointments/${encodeURIComponent(appointmentId)}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.INTERNAL_SERVICE_SECRET
            ? { 'x-internal-service-key': process.env.INTERNAL_SERVICE_SECRET }
            : {}),
          ...(process.env.INTERNAL_SECRET ? { 'x-internal-secret': process.env.INTERNAL_SECRET } : {}),
        },
      });

      if (!response.ok) {
        const body = await response.text();
        console.warn('[ConsultationService] Failed to mark appointment completed via gateway:', {
          appointmentId,
          status: response.status,
          body,
        });
      }
    } catch (error) {
      console.warn('[ConsultationService] Appointment completion callback failed:', {
        appointmentId,
        error: error.message,
      });
    }
  })();
};

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

    if (!consultation) return null;

    const [enriched] = await this._attachDocuments([consultation]);
    return enriched;
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
    
    const [enriched] = await this._attachDocuments([consultation]);
    const channelName = enriched.channelName || `appointment-${appointmentId}`;
    return { ...enriched, channelName };
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

    notifyAppointmentCompleted(appointmentId);

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

    notifyAppointmentCompleted(updated.appointmentId);

    return updated;
  }

  /**
   * Get consultation history by patient ID
   */
  async getHistoryByPatientId(patientId, filters = {}) {
    const { status, page = 1, limit = 20, search, startDate, endDate } = filters;
    const skip = (page - 1) * limit;

    const where = { patientId };
    if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { diagnosis: { contains: search, mode: 'insensitive' } },
        { 
          notes: { 
            some: { 
              content: { contains: search, mode: 'insensitive' } 
            } 
          } 
        }
      ];
    }

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;
      if (end) end.setHours(23, 59, 59, 999);

      where.createdAt = {};
      if (start) where.createdAt.gte = start;
      if (end) where.createdAt.lte = end;
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
          createdAt: 'desc'
        }
      }),
      prisma.consultation.count({ where })
    ]);

    const enriched = await this._attachDocuments(consultations);

    return {
      consultations: enriched,
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
          createdAt: 'desc'
        }
      }),
      prisma.consultation.count({ where })
    ]);

    const enriched = await this._attachDocuments(consultations);

    return {
      consultations: enriched,
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

    const consultations = await prisma.consultation.findMany({
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

    return this._attachDocuments(consultations);
  }

  /**
   * Internal: Aggregates medical documents for multiple consultations via API Gateway.
   * Routes through Gateway to medical-records-service.
   */
  async _attachDocuments(consultations) {
    if (!consultations || consultations.length === 0) return consultations;

    const ids = consultations.map((c) => c.id);
    const mappings = {};
    consultations.forEach((c) => {
      if (c.id && c.appointmentId) {
        mappings[c.id] = c.appointmentId;
      }
    });

    const GATEWAY_URL = process.env.BASE_URL; // e.g. http://localhost:8080/api/v1/
    const GATEWAY_SECRET = process.env.INTERNAL_SERVICE_SECRET;
    const TARGET_SECRET = process.env.INTERNAL_SECRET;

    if (!GATEWAY_URL || !GATEWAY_SECRET) {
      console.warn("[ConsultationService] Document aggregation skipped: BASE_URL or INTERNAL_SERVICE_SECRET not configured");
      return consultations.map((c) => ({ ...c, documents: [] }));
    }

    try {
      // url = http://localhost:8080/api/v1/documents/consultations/bulk
      const url = `${GATEWAY_URL.endsWith("/") ? GATEWAY_URL : GATEWAY_URL + "/"}documents/consultations/bulk`;
      
      const response = await axios.post(
        url,
        { ids, mappings },
        {
          headers: {
            "Content-Type": "application/json",
            "x-internal-service-key": GATEWAY_SECRET,
            "x-internal-secret": TARGET_SECRET,
          },
          timeout: 5000,
        }
      );

      const json = response.data;
      const documentMap = json?.data || {};

      // 5. Map results back to consultations
      return consultations.map((c) => ({
        ...c,
        documents: documentMap[c.id] || [],
      }));
    } catch (error) {
      console.error(`[ConsultationService] Error fetching documents from ${GATEWAY_URL}:`, error.message);
      return consultations.map((c) => ({ ...c, documents: [] }));
    }
  }

  /**
   * Get unique patient IDs who have consulted with a specific doctor.
   * @param {string} doctorId 
   * @returns {Promise<string[]>}
   */
  /**
   * Get dynamic performance snapshot metrics for a doctor.
   * @param {string} doctorId - Doctor profile ID or user auth ID
   * @param {string} period - 'daily' | 'weekly' | 'monthly' | 'all'
   */
  async getPerformanceMetrics(inputDoctorId, period = 'all') {
    const now = new Date();

    // 1. Resolve all doctor IDs (profile id and auth user id)
    const docIds = [inputDoctorId];
    try {
      const prof = await profileClient.getDoctorProfile(inputDoctorId);
      if (prof?.id && !docIds.includes(prof.id)) docIds.push(prof.id);
      if (prof?.userId && !docIds.includes(prof.userId)) docIds.push(prof.userId);
    } catch {}

    // Find all consultations matching any of the doctor's IDs
    let allConsults = await prisma.consultation.findMany({
      where: {
        OR: [
          { doctorId: { in: docIds } },
          { doctorAuthId: { in: docIds } }
        ]
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        endedAt: true,
        duration: true,
        rating: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    const allCompleted = allConsults.filter(c => c.status === 'COMPLETED');
    const totalAttempted = allConsults.length;

    let pStart, pEnd, prevS, prevE, periodLabel, prevLabel;

    if (period === 'daily') {
      pStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      pEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      prevS = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
      prevE = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);

      periodLabel = 'today';
      prevLabel = 'yesterday';
    } else if (period === 'weekly') {
      const day = now.getDay();
      pStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day, 0, 0, 0, 0);
      pEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - day), 23, 59, 59, 999);

      prevS = new Date(pStart);
      prevS.setDate(prevS.getDate() - 7);
      prevE = new Date(pEnd);
      prevE.setDate(prevE.getDate() - 7);

      periodLabel = 'this week';
      prevLabel = 'last week';
    } else if (period === 'monthly') {
      pStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      pEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      prevS = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      prevE = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

      periodLabel = 'this month';
      prevLabel = 'last month';
    } else {
      periodLabel = 'all time';
      prevLabel = 'historical';
    }

    const isMatch = (c, start, end) => {
      const d = c.endedAt || c.startedAt || c.createdAt;
      if (!d) return false;
      const t = new Date(d).getTime();
      return t >= start.getTime() && t <= end.getTime();
    };

    let currentConsults = [];
    let prevConsults = [];

    if (period === 'all') {
      currentConsults = allCompleted;
      prevConsults = allCompleted;
    } else {
      currentConsults = allCompleted.filter(c => isMatch(c, pStart, pEnd));
      prevConsults = allCompleted.filter(c => isMatch(c, prevS, prevE));
    }

    const targetConsults = (period !== 'all' && currentConsults.length === 0) ? allCompleted : currentConsults;
    const completedCount = currentConsults.length;
    const prevCount = prevConsults.length;
    const diff = completedCount - prevCount;
    const consultationChange = period === 'all'
      ? 'All Time Total'
      : (diff >= 0 ? `+${diff} vs ${prevLabel}` : `${diff} vs ${prevLabel}`);

    // Average duration
    let avgDurationStr = '—';
    const durationsSeconds = [];
    targetConsults.forEach(c => {
      if (typeof c.duration === 'number' && c.duration > 0) {
        durationsSeconds.push(c.duration);
      } else if (c.startedAt && c.endedAt) {
        const s = new Date(c.startedAt).getTime();
        const e = new Date(c.endedAt).getTime();
        if (!isNaN(s) && !isNaN(e)) {
          const d = Math.max(0, Math.floor((e - s) / 1000));
          if (d > 0) durationsSeconds.push(d);
        }
      }
    });

    if (durationsSeconds.length > 0) {
      const avgSec = Math.round(durationsSeconds.reduce((a, b) => a + b, 0) / durationsSeconds.length);
      const mins = Math.floor(avgSec / 60);
      const secs = avgSec % 60;
      avgDurationStr = secs > 0 ? `${mins}m ${secs}s` : `${mins} mins`;
    }

    // Completion rate
    const completionPercent = totalAttempted > 0
      ? Math.min(100, Math.round((allCompleted.length / totalAttempted) * 100))
      : 100;
    const completionRate = `${completionPercent}%`;

    // Rating
    const ratedConsults = targetConsults.filter(c => typeof c.rating === 'number' && c.rating > 0);
    let avgRating = null;
    if (ratedConsults.length > 0) {
      const sum = ratedConsults.reduce((acc, c) => acc + (c.rating || 0), 0);
      avgRating = Math.round((sum / ratedConsults.length) * 10) / 10;
    }

    return {
      consultations: completedCount,
      consultationChange,
      avgDuration: avgDurationStr,
      durationChange: targetConsults.length > 0 ? 'Optimal SLA (<15m)' : 'No data yet',
      completionRate,
      rating: avgRating,
      totalCompleted: allCompleted.length,
      totalAttempted
    };
  }
}

module.exports = new ConsultationService();
