const prisma = require('../prisma/prisma');

class SlotService {
  /**
   * Find available slots for a doctor within a date range
   */
  async findAvailableSlots(doctorId, startDate, endDate) {
    const slots = await prisma.slot.findMany({
      where: {
        doctorId,
        status: 'AVAILABLE',
        startTime: {
          gte: startDate,
          lte: endDate
        },
        slotLock: null, // No active lock
        appointments: {
          none: {} // No appointments booked
        }
      },
      orderBy: {
        startTime: 'asc'
      }
    });

    return slots;
  }

  /**
   * Find slots by doctor ID with optional filters
   */
  async findByDoctorId(doctorId, filters = {}) {
    const { status, startDate, endDate } = filters;

    const where = {
      doctorId
    };

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) {
        where.startTime.gte = new Date(startDate);
      }
      if (endDate) {
        where.startTime.lte = new Date(endDate);
      }
    }

    const slots = await prisma.slot.findMany({
      where,
      include: {
        appointments: {
          include: {
            slot: true
          }
        },
        slotLock: true
      },
      orderBy: {
        startTime: 'asc'
      }
    });

    return slots;
  }

  /**
   * Find slot by ID
   */
  findById(id) {
    return prisma.slot.findUnique({
      where: { id },
      include: {
        appointments: true,
        slotLock: true
      }
    });
  }

  /**
   * Create a new slot
   */
  async create(data) {
    // Validate time range
    if (new Date(data.endTime) <= new Date(data.startTime)) {
      throw new Error('End time must be after start time');
    }

    // Check for overlapping slots
    const overlapping = await prisma.slot.findFirst({
      where: {
        doctorId: data.doctorId,
        status: {
          in: ['AVAILABLE', 'BOOKED']
        },
        OR: [
          {
            AND: [
              { startTime: { lte: data.startTime } },
              { endTime: { gt: data.startTime } }
            ]
          },
          {
            AND: [
              { startTime: { lt: data.endTime } },
              { endTime: { gte: data.endTime } }
            ]
          },
          {
            AND: [
              { startTime: { gte: data.startTime } },
              { endTime: { lte: data.endTime } }
            ]
          }
        ]
      }
    });

    if (overlapping) {
      throw new Error('Slot overlaps with existing slot');
    }

    return prisma.slot.create({
      data: {
        doctorId: data.doctorId,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        status: data.status || 'AVAILABLE'
      }
    });
  }

  /**
   * Create multiple slots (bulk create)
   */
  async createBulk(slots) {
    // Validate all slots first
    for (const slot of slots) {
      if (new Date(slot.endTime) <= new Date(slot.startTime)) {
        throw new Error(`Invalid time range for slot starting at ${slot.startTime}`);
      }
    }

    return prisma.slot.createMany({
      data: slots.map(slot => ({
        doctorId: slot.doctorId,
        startTime: new Date(slot.startTime),
        endTime: new Date(slot.endTime),
        status: slot.status || 'AVAILABLE'
      })),
      skipDuplicates: true
    });
  }

  /**
   * Update slot
   */
  async update(id, data) {
    const slot = await this.findById(id);
    if (!slot) {
      throw new Error('Slot not found');
    }

    // If updating time, check for overlaps
    if (data.startTime || data.endTime) {
      const startTime = data.startTime ? new Date(data.startTime) : slot.startTime;
      const endTime = data.endTime ? new Date(data.endTime) : slot.endTime;

      if (endTime <= startTime) {
        throw new Error('End time must be after start time');
      }

      const overlapping = await prisma.slot.findFirst({
        where: {
          id: { not: id },
          doctorId: slot.doctorId,
          status: {
            in: ['AVAILABLE', 'BOOKED']
          },
          OR: [
            {
              AND: [
                { startTime: { lte: startTime } },
                { endTime: { gt: startTime } }
              ]
            },
            {
              AND: [
                { startTime: { lt: endTime } },
                { endTime: { gte: endTime } }
              ]
            },
            {
              AND: [
                { startTime: { gte: startTime } },
                { endTime: { lte: endTime } }
              ]
            }
          ]
        }
      });

      if (overlapping) {
        throw new Error('Updated slot overlaps with existing slot');
      }
    }

    return prisma.slot.update({
      where: { id },
      data: {
        ...(data.startTime && { startTime: new Date(data.startTime) }),
        ...(data.endTime && { endTime: new Date(data.endTime) }),
        ...(data.status && { status: data.status })
      }
    });
  }

  /**
   * Delete slot (only if not booked)
   */
  async delete(id) {
    const slot = await this.findById(id);
    if (!slot) {
      throw new Error('Slot not found');
    }

    if (slot.status === 'BOOKED' || slot.appointments.length > 0) {
      throw new Error('Cannot delete a booked slot');
    }

    return prisma.slot.delete({
      where: { id }
    });
  }

  /**
   * Lock a slot (prevent double-booking during booking process)
   */
  async lockSlot(slotId, lockedBy, expiresInMinutes = 5) {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

    // Clean up expired locks first
    await this.cleanExpiredLocks();

    // Check if slot is already locked
    const existingLock = await prisma.slotLock.findUnique({
      where: { slotId }
    });

    if (existingLock && existingLock.expiresAt > new Date()) {
      throw new Error('Slot is already locked');
    }

    return prisma.slotLock.upsert({
      where: { slotId },
      update: {
        lockedBy,
        expiresAt
      },
      create: {
        slotId,
        lockedBy,
        expiresAt
      }
    });
  }

  /**
   * Unlock a slot
   */
  async unlockSlot(slotId) {
    return prisma.slotLock.delete({
      where: { slotId }
    }).catch(() => {
      // Ignore if lock doesn't exist
    });
  }

  /**
   * Clean up expired locks
   */
  async cleanExpiredLocks() {
    return prisma.slotLock.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
  }
}

module.exports = new SlotService();
