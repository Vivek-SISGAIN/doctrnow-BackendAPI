const prisma = require("../prisma/prisma");
const slotService = require("./slot.service");
const ApiError = require("../utils/ApiError");
const axios = require("axios");
const dayjs = require("dayjs");

class AppointmentService {
  /**
   * Find all appointments with filtering and pagination
   */
  async findAll(filters = {}, pagination = { page: 1, limit: 20 }) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where = this.buildWhereClause(filters);

    const [appointments, total] = await Promise.all([
      prisma.appointment.findMany({
        where,
        include: {
          slot: true,
        },
        skip,
        take: parseInt(limit, 10),
        orderBy: {
          createdAt: "desc",
        },
      }),
      prisma.appointment.count({ where }),
    ]);

    // Aggregate medical documents
    const enrichedAppointments = await this._attachDocuments(appointments);

    return {
      appointments: enrichedAppointments,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Build where clause for filtering
   */
  buildWhereClause({
    patientId,
    doctorId,
    hospitalId,
    status,
    paymentStatus,
    consultationType,
    startDate,
    endDate,
    search,
  }) {
    const where = {};

    if (patientId) {
      where.patientId = patientId;
    }

    if (doctorId) {
      where.doctorId = doctorId;
    }

    if (hospitalId) {
      where.hospitalId = hospitalId;
    }

    if (status) {
      where.status = status;
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    if (consultationType) {
      where.consultationType = consultationType;
    }

    if (startDate || endDate) {
      where.slot = {
        startTime: {},
      };
      if (startDate) {
        where.slot.startTime.gte = new Date(startDate);
      }
      if (endDate) {
        where.slot.startTime.lte = new Date(endDate);
      }
    }

    if (search) {
      // Note: appointment ids are UUIDs stored as strings; avoid case-insensitive ops.
      // This supports searching by appointmentId/patientId/doctorId/hospitalId.
      where.OR = [
        { id: { contains: String(search) } },
        { patientId: { contains: String(search) } },
        { doctorId: { contains: String(search) } },
        { hospitalId: { contains: String(search) } },
      ];
    }

    return where;
  }

  /**
   * Find appointment by ID
   */
  async findById(id) {
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: {
        slot: true,
      },
    });

    if (!appointment) return null;

    const [enriched] = await this._attachDocuments([appointment]);
    return enriched;
  }

  /**
   * Internal: Aggregates medical documents for multiple appointments via API Gateway.
   * Routes through Gateway to medical-records-service.
   */
  async _attachDocuments(appointments) {
    if (!appointments || appointments.length === 0) return appointments;

    const ids = appointments.map((a) => a.id);
    const GATEWAY_URL = process.env.BASE_URL; // e.g. http://localhost:8080/api/v1/
    const GATEWAY_SECRET = process.env.INTERNAL_SERVICE_SECRET;
    const TARGET_SECRET = process.env.INTERNAL_SECRET;

    if (!GATEWAY_URL || !GATEWAY_SECRET) {
      console.warn("[AppointmentService] Document aggregation skipped: BASE_URL or INTERNAL_SERVICE_SECRET not configured");
      return appointments.map((a) => ({ ...a, documents: [] }));
    }

    try {
      const baseUrl = GATEWAY_URL.endsWith("/") ? GATEWAY_URL : GATEWAY_URL + "/";
      
      // 1. Fetch Consultation Mappings (AppointmentID -> ConsultationID)
      let mappings = {};
      try {
        const consultUrl = `${baseUrl}consultations/bulk`;
        const consultRes = await axios.post(
          consultUrl,
          { ids },
          {
            headers: {
              "Content-Type": "application/json",
              "x-internal-service-key": GATEWAY_SECRET,
              "x-internal-secret": TARGET_SECRET,
            },
            timeout: 3000,
          }
        );
        
        const consultMap = consultRes.data?.data || {};
        Object.entries(consultMap).forEach(([key, consult]) => {
          if (consult && consult.appointmentId && consult.id) {
            mappings[consult.appointmentId] = consult.id;
          }
        });
      } catch (err) {
        console.warn("[AppointmentService] Failed to fetch consultation mappings:", err.message);
      }

      // 2. Fetch Aggregated Documents
      const docUrl = `${baseUrl}documents/appointments/bulk`;
      const response = await axios.post(
        docUrl,
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

      const documentMap = response.data?.data || {};
      return appointments.map((a) => ({
        ...a,
        documents: documentMap[a.id] || [],
      }));
    } catch (error) {
      console.error(`[AppointmentService] Error fetching documents from ${GATEWAY_URL}:`, error.message);
      return appointments.map((a) => ({ ...a, documents: [] }));
    }
  }

  /**
   * Create a new appointment
   */
  async create(data) {
    // Check if slot exists and is available
    const slot = await slotService.findById(data.slotId);
    if (!slot) {
      throw ApiError.notFound("Slot not found");
    }

    if (slot.status !== "AVAILABLE") {
      throw ApiError.conflict("Slot is not available");
    }

    // Check if slot is locked by someone else
    if (slot.slotLock && slot.slotLock.expiresAt > new Date()) {
      if (slot.slotLock.lockedBy !== data.patientId) {
        throw ApiError.conflict("Slot is currently locked by another user");
      }
    }

    // Check if slot already has an appointment
    const existingAppointment = await prisma.appointment.findFirst({
      where: { 
        slotId: data.slotId,
        status: { not: "CANCELLED" }
      },
    });

    if (existingAppointment) {
      throw ApiError.conflict("Slot is already booked");
    }

    // Create appointment and update slot status in a transaction
    const appointment = await prisma.$transaction(async (tx) => {
      const newAppointment = await tx.appointment.create({
        data: {
          patientId: data.patientId,
          doctorId: data.doctorId,
          slotId: data.slotId,
          hospitalId: data.hospitalId,
          status: data.status || (data.paymentStatus === "PAID" ? "CONFIRMED" : "PENDING"),
          paymentStatus: data.paymentStatus || "PENDING",
          consultationType: data.consultationType || "VIDEO",
          reason: data.reason,
          notes: data.notes,
          familyMemberId: data.familyMemberId,
        },
        include: {
          slot: true,
        },
      });

      // Update slot status to BOOKED
      await tx.slot.update({
        where: { id: data.slotId },
        data: { status: "BOOKED" },
      });

      // Remove slot lock if exists
      await slotService.unlockSlot(data.slotId);

      return newAppointment;
    });

    return appointment;
  }

  /**
   * Update appointment
   */
  async update(id, data) {
    const appointment = await this.findById(id);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    return prisma.appointment.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.paymentStatus && { paymentStatus: data.paymentStatus }),
        ...(data.consultationType && {
          consultationType: data.consultationType,
        }),
        ...(data.reason !== undefined && { reason: data.reason }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: {
        slot: true,
      },
    });
  }

  /**
   * Cancel appointment
   */
  async cancel(id, reason) {
    const appointment = await this.findById(id);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    if (appointment.status === "CANCELLED") {
      throw new Error("Appointment is already cancelled");
    }

    if (appointment.status === "COMPLETED") {
      throw new Error("Cannot cancel a completed appointment");
    }

    return prisma.$transaction(async (tx) => {
      // Update appointment status
      const updatedAppointment = await tx.appointment.update({
        where: { id },
        data: {
          status: "CANCELLED",
          notes: reason
            ? `${appointment.notes || ""}\nCancellation reason: ${reason}`.trim()
            : appointment.notes,
        },
        include: {
          slot: true,
        },
      });

      // Update slot status back to AVAILABLE
      await tx.slot.update({
        where: { id: appointment.slotId },
        data: { status: "AVAILABLE" },
      });

      return updatedAppointment;
    });
  }

  /**
   * Reschedule appointment (cancel old and create new)
   */
  async reschedule(appointmentId, newSlotId) {
    const appointment = await this.findById(appointmentId);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    if (appointment.status === "COMPLETED") {
      throw new Error("Cannot reschedule a completed appointment");
    }

    if (appointment.status === "CANCELLED") {
      throw new Error("Cannot reschedule a cancelled appointment");
    }

    // Check new slot availability
    const newSlot = await slotService.findById(newSlotId);
    if (!newSlot) {
      throw new Error("New slot not found");
    }

    if (newSlot.status !== "AVAILABLE") {
      throw new Error("New slot is not available");
    }

    return prisma.$transaction(async (tx) => {
      // Cancel old appointment and free old slot
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: "CANCELLED",
          notes: `${appointment.notes || ""}\nRescheduled to new slot`.trim(),
        },
      });

      await tx.slot.update({
        where: { id: appointment.slotId },
        data: { status: "AVAILABLE" },
      });

      // Create new appointment
      const newAppointment = await tx.appointment.create({
        data: {
          patientId: appointment.patientId,
          doctorId: appointment.doctorId,
          hospitalId: appointment.hospitalId,
          slotId: newSlotId,
          status:
            appointment.paymentStatus === "PAID" ? "CONFIRMED" : "PENDING",
          paymentStatus: appointment.paymentStatus,
          consultationType: appointment.consultationType,
          reason: appointment.reason,
          familyMemberId: appointment.familyMemberId,
          notes: `Rescheduled from appointment ${appointmentId}`,
        },
        include: {
          slot: true,
        },
      });

      // Update new slot status
      await tx.slot.update({
        where: { id: newSlotId },
        data: { status: "BOOKED" },
      });

      return newAppointment;
    });
  }

  /**
   * Confirm appointment (typically after payment)
   */
  async confirm(id) {
    const appointment = await this.findById(id);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    if (appointment.status === "CONFIRMED") {
      return appointment;
    }

    if (appointment.status === "CANCELLED") {
      throw new Error("Cannot confirm a cancelled appointment");
    }

    return prisma.appointment.update({
      where: { id },
      data: {
        status: "CONFIRMED",
      },
      include: {
        slot: true,
      },
    });
  }

  /**
   * Mark appointment as completed
   */
  async complete(id) {
    const appointment = await this.findById(id);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    if (appointment.status === "COMPLETED") {
      return appointment;
    }

    if (appointment.status === "CANCELLED") {
      throw new Error("Cannot complete a cancelled appointment");
    }

    return prisma.appointment.update({
      where: { id },
      data: {
        status: "COMPLETED",
      },
      include: {
        slot: true,
      },
    });
  }

  /**
   * Mark missed appointments as no-show (slot end time passed, status still CONFIRMED/PENDING, no action taken).
   * Call when loading appointments to auto-update missed slots.
   * @param {string} [doctorId] - Optional: only mark appointments for this doctor
   * @returns {Object} { count: number of appointments marked }
   */
  async markMissedAsNoShow(doctorId) {
    const now = new Date();
    const where = {
      status: { in: ["CONFIRMED", "PENDING"] },
      slot: {
        endTime: { lt: now },
      },
    };
    if (doctorId) where.doctorId = doctorId;

    const missed = await prisma.appointment.findMany({
      where,
      select: { id: true },
    });

    for (const apt of missed) {
      await prisma.appointment.update({
        where: { id: apt.id },
        data: { status: "NO_SHOW" },
      });
    }

    return { count: missed.length };
  }

  /**
   * Mark appointment as no-show
   */
  async markNoShow(id) {
    const appointment = await this.findById(id);
    if (!appointment) {
      throw new Error("Appointment not found");
    }

    if (appointment.status === "COMPLETED") {
      throw new Error("Cannot mark a completed appointment as no-show");
    }

    return prisma.appointment.update({
      where: { id },
      data: {
        status: "NO_SHOW",
      },
      include: {
        slot: true,
      },
    });
  }
  async getHospitalPatients(hospitalId, pagination = { page: 1, limit: 20 }) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    console.log(hospitalId, "Service Hospital ID");

    // 1. Get unique patient IDs from appointments for this hospital
    // We use distinct to get unique patients who have visited this hospital
    const [appointments, groups] = await Promise.all([
      prisma.appointment.findMany({
        where: { hospitalId },
        distinct: ["patientId"],
        select: {
          patientId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: parseInt(limit, 10),
      }),
      // For total count of unique patients
      prisma.appointment.groupBy({
        by: ["patientId"],
        where: { hospitalId },
      }),
    ]);

    const patients = appointments.map((apt) => ({
      id: apt.patientId,
      createdAt: apt.createdAt,
    }));

    const total = groups.length;

    console.log("Patients Found (IDs only)------", patients.length);

    return {
      patients,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get all unique patient ids for a hospital, ordered by most recent appointment.
   * Used for server-side search over patient profiles (via profile-service bulk lookups).
   */
  async getAllHospitalPatientIds(hospitalId) {
    const groups = await prisma.appointment.groupBy({
      by: ["patientId"],
      where: { hospitalId },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
    });

    return groups
      .map((g) => ({
        id: g.patientId,
        lastVisit: g._max?.createdAt || null,
      }))
      .filter((g) => Boolean(g.id));
  }

  async getPreviouslyConsultedDoctors(patientId) {
    const groups = await prisma.appointment.groupBy({
      by: ["doctorId"],
      where: {
        patientId,
      },
      _max: {
        createdAt: true,
      },
      orderBy: {
        _max: {
          createdAt: "desc",
        },
      },
    });

    return groups.map((g) => ({
      doctorId: g.doctorId,
      lastConsultedAt: g._max?.createdAt || null,
    }));
  }

  /**
   * Extend the appointment duration
   */
  async extend(id) {
    const appointment = await this.findById(id);
    if (!appointment) {
      throw ApiError.notFound("Appointment not found");
    }

    if (appointment.status === "CANCELLED" || appointment.status === "COMPLETED") {
      throw ApiError.badRequest(`Cannot extend a ${appointment.status.toLowerCase()} appointment`);
    }

    if (appointment.extend_used) {
      throw ApiError.badRequest("Extension already used for this appointment");
    }

    // Default 5 minutes per user request
    const durationMinutes = parseInt(process.env.CALL_EXTEND_DURATION_MINUTES || "5", 10);
    
    const availability = await slotService.checkNextSlotAvailability(
      appointment.doctorId,
      appointment.slot.endTime,
      durationMinutes
    );

    if (!availability.available) {
      const err = new Error("The next appointment slot is booked. Call cannot be extended.");
      err.statusCode = 409;
      err.reason = "NEXT_SLOT_BOOKED";
      throw err;
    }

    return prisma.$transaction(async (tx) => {
      // Update the slot end time
      const newEndTime = dayjs(appointment.slot.endTime).add(durationMinutes, "minute").toDate();
      
      await tx.slot.update({
        where: { id: appointment.slotId },
        data: { endTime: newEndTime },
      });

      // Mark extension as used
      const updatedAppointment = await tx.appointment.update({
        where: { id },
        data: { extend_used: true },
        include: { slot: true },
      });

      // Notify consultation-service to broadcast
      try {
        const CONSULTATION_SERVICE_URL = process.env.CONSULTATION_SERVICE_URL || "http://localhost:3005";
        console.log(`[BROADCAST DEBUG] Initiating extension broadcast for Appointment: ${id}`);
        console.log(`[BROADCAST DEBUG] Target URL: ${CONSULTATION_SERVICE_URL}/api/consultations/appointment/${id}/broadcast-extension`);
        
        await axios.post(`${CONSULTATION_SERVICE_URL}/api/consultations/appointment/${id}/broadcast-extension`, {
          newEndTime,
          extendedByMinutes: durationMinutes,
        });
        
        console.log(`[BROADCAST DEBUG] Extension broadcast successful for Appointment: ${id}`);
      } catch (e) {
        process.stdout.write(`\x1b[31m[BROADCAST ERROR] Failed to notify Consultation Service for Appointment: ${id}\x1b[0m\n`);
        process.stdout.write(`\x1b[31m[BROADCAST ERROR] Error Details: ${e.message}\x1b[0m\n`);
        if (e.response) {
          process.stdout.write(`\x1b[31m[BROADCAST ERROR] Response Status: ${e.response.status}\x1b[0m\n`);
          process.stdout.write(`\x1b[31m[BROADCAST ERROR] Response Data: ${JSON.stringify(e.response.data)}\x1b[0m\n`);
        }
      }

      return updatedAppointment;
    });
  }
}

module.exports = new AppointmentService();
