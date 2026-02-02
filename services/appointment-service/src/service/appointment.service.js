const prisma = require('../prisma/prisma');
const slotService = require('./slot.service');

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
          slot: true
        },
        skip,
        take: parseInt(limit, 10),
        orderBy: {
          createdAt: 'desc'
        }
      }),
      prisma.appointment.count({ where })
    ]);

    return {
      appointments,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Build where clause for filtering
   */
  buildWhereClause({ patientId, doctorId, status, paymentStatus, consultationType, startDate, endDate }) {
    const where = {};

    if (patientId) {
      where.patientId = patientId;
    }

    if (doctorId) {
      where.doctorId = doctorId;
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
        startTime: {}
      };
      if (startDate) {
        where.slot.startTime.gte = new Date(startDate);
      }
      if (endDate) {
        where.slot.startTime.lte = new Date(endDate);
      }
    }

    return where;
  }

  /**
   * Find appointment by ID
   */
  findById(id) {
    return prisma.appointment.findUnique({
      where: { id },
      include: {
        slot: true
      }
    });
  }

  /**
   * Create a new appointment
   */
  async create(data) {
    // Check if slot exists and is available
    const slot = await slotService.findById(data.slotId);
    if (!slot) {
      throw new Error('Slot not found');
    }

    if (slot.status !== 'AVAILABLE') {
      throw new Error('Slot is not available');
    }

    // Check if slot is locked by someone else
    if (slot.slotLock && slot.slotLock.expiresAt > new Date()) {
      if (slot.slotLock.lockedBy !== data.patientId) {
        throw new Error('Slot is currently locked by another user');
      }
    }

    // Check if slot already has an appointment
    const existingAppointment = await prisma.appointment.findUnique({
      where: { slotId: data.slotId }
    });

    if (existingAppointment) {
      throw new Error('Slot is already booked');
    }

    // Create appointment and update slot status in a transaction
    const appointment = await prisma.$transaction(async (tx) => {
      const newAppointment = await tx.appointment.create({
        data: {
          patientId: data.patientId,
          doctorId: data.doctorId,
          slotId: data.slotId,
          status: data.status || 'PENDING',
          paymentStatus: data.paymentStatus || 'PENDING',
          consultationType: data.consultationType || 'VIDEO',
          reason: data.reason,
          notes: data.notes,
          familyMemberId: data.familyMemberId
        },
        include: {
          slot: true
        }
      });

      // Update slot status to BOOKED
      await tx.slot.update({
        where: { id: data.slotId },
        data: { status: 'BOOKED' }
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
      throw new Error('Appointment not found');
    }

    return prisma.appointment.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.paymentStatus && { paymentStatus: data.paymentStatus }),
        ...(data.consultationType && { consultationType: data.consultationType }),
        ...(data.reason !== undefined && { reason: data.reason }),
        ...(data.notes !== undefined && { notes: data.notes })
      },
      include: {
        slot: true
      }
    });
  }

  /**
   * Cancel appointment
   */
  async cancel(id, reason) {
    const appointment = await this.findById(id);
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    if (appointment.status === 'CANCELLED') {
      throw new Error('Appointment is already cancelled');
    }

    if (appointment.status === 'COMPLETED') {
      throw new Error('Cannot cancel a completed appointment');
    }

    return prisma.$transaction(async (tx) => {
      // Update appointment status
      const updatedAppointment = await tx.appointment.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: reason ? `${appointment.notes || ''}\nCancellation reason: ${reason}`.trim() : appointment.notes
        },
        include: {
          slot: true
        }
      });

      // Update slot status back to AVAILABLE
      await tx.slot.update({
        where: { id: appointment.slotId },
        data: { status: 'AVAILABLE' }
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
      throw new Error('Appointment not found');
    }

    if (appointment.status === 'COMPLETED') {
      throw new Error('Cannot reschedule a completed appointment');
    }

    if (appointment.status === 'CANCELLED') {
      throw new Error('Cannot reschedule a cancelled appointment');
    }

    // Check new slot availability
    const newSlot = await slotService.findById(newSlotId);
    if (!newSlot) {
      throw new Error('New slot not found');
    }

    if (newSlot.status !== 'AVAILABLE') {
      throw new Error('New slot is not available');
    }

    return prisma.$transaction(async (tx) => {
      // Cancel old appointment and free old slot
      await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          status: 'CANCELLED',
          notes: `${appointment.notes || ''}\nRescheduled to new slot`.trim()
        }
      });

      await tx.slot.update({
        where: { id: appointment.slotId },
        data: { status: 'AVAILABLE' }
      });

      // Create new appointment
      const newAppointment = await tx.appointment.create({
        data: {
          patientId: appointment.patientId,
          doctorId: appointment.doctorId,
          slotId: newSlotId,
          status: appointment.paymentStatus === 'PAID' ? 'CONFIRMED' : 'PENDING',
          paymentStatus: appointment.paymentStatus,
          consultationType: appointment.consultationType,
          reason: appointment.reason,
          familyMemberId: appointment.familyMemberId,
          notes: `Rescheduled from appointment ${appointmentId}`
        },
        include: {
          slot: true
        }
      });

      // Update new slot status
      await tx.slot.update({
        where: { id: newSlotId },
        data: { status: 'BOOKED' }
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
      throw new Error('Appointment not found');
    }

    if (appointment.status === 'CONFIRMED') {
      return appointment;
    }

    if (appointment.status === 'CANCELLED') {
      throw new Error('Cannot confirm a cancelled appointment');
    }

    return prisma.appointment.update({
      where: { id },
      data: {
        status: 'CONFIRMED'
      },
      include: {
        slot: true
      }
    });
  }

  /**
   * Mark appointment as completed
   */
  async complete(id) {
    const appointment = await this.findById(id);
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    if (appointment.status === 'COMPLETED') {
      return appointment;
    }

    if (appointment.status === 'CANCELLED') {
      throw new Error('Cannot complete a cancelled appointment');
    }

    return prisma.appointment.update({
      where: { id },
      data: {
        status: 'COMPLETED'
      },
      include: {
        slot: true
      }
    });
  }

  /**
   * Mark appointment as no-show
   */
  async markNoShow(id) {
    const appointment = await this.findById(id);
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    if (appointment.status === 'COMPLETED') {
      throw new Error('Cannot mark a completed appointment as no-show');
    }

    return prisma.appointment.update({
      where: { id },
      data: {
        status: 'NO_SHOW'
      },
      include: {
        slot: true
      }
    });
  }
}

module.exports = new AppointmentService();
