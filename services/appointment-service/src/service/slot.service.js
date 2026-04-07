const prisma = require("../prisma/prisma");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");

dayjs.extend(utc);
dayjs.extend(timezone);

const UAE_TZ = "Asia/Dubai";

class SlotService {
  // ─────────────────────────────────────────────────────────────────────────────
  // PRIVATE GUARDS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Throws if the slot's startTime is in the past.
   * Call this before any mutation (book, update, delete, lock).
   */
  _assertNotPast(slot) {
    if (new Date(slot.startTime) < new Date()) {
      const err = new Error(
        "This slot is in the past and can no longer be modified or booked.",
      );
      err.statusCode = 400;
      throw err;
    }
  }

  /**
   * Throws if the slot is not in AVAILABLE status.
   */
  _assertAvailable(slot) {
    if (slot.status !== "AVAILABLE") {
      const err = new Error(
        `Slot is not available. Current status: ${slot.status}`,
      );
      err.statusCode = 400;
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // READ
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Find available slots for a doctor within a date range.
   * Only returns slots with startTime >= now (no past slots).
   * Deduplicates by (doctorId, startTime) so the same time never appears twice.
   */
  async findAvailableSlots(doctorId, startDate, endDate) {
    const now = new Date();
    const effectiveStart = startDate < now ? now : startDate;

    const slots = await prisma.slot.findMany({
      where: {
        doctorId,
        status: "AVAILABLE",
        startTime: {
          gte: effectiveStart,
          lte: endDate,
        },
        slotLock: null,
        appointments: {
          none: {
            status: { not: "CANCELLED" }
          },
        },
      },
      orderBy: {
        startTime: "asc",
      },
    });

    // Deduplicate by (doctorId, startTime) – keep first occurrence
    const seen = new Set();
    return slots.filter((s) => {
      const key = `${s.doctorId}-${s.startTime.getTime()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Find slots by doctor ID with optional filters.
   * Never returns past AVAILABLE slots — those are stale.
   */
  async findByDoctorId(doctorId, filters = {}) {
    const { status, startDate, endDate } = filters;

    const where = { doctorId };

    if (status) {
      where.status = status;
    }

    // For AVAILABLE slots, always enforce startTime >= now
    // so stale unbooked slots never surface to callers.
    if (status === "AVAILABLE" || !status) {
      where.startTime = { gte: new Date() };
    }

    if (startDate || endDate) {
      where.startTime = where.startTime || {};
      if (startDate) where.startTime.gte = new Date(startDate);
      if (endDate) where.startTime.lte = new Date(endDate);
    }

    return prisma.slot.findMany({
      where,
      include: {
        appointments: { include: { slot: true } },
        slotLock: true,
      },
      orderBy: { startTime: "asc" },
    });
  }

  /**
   * Find slot by ID.
   */
  findById(id) {
    return prisma.slot.findUnique({
      where: { id },
      include: { appointments: true, slotLock: true },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Create a single slot manually.
   * Guards: slot must not be in the past, times must be valid, no overlaps.
   */
  async create(data) {
    const startTime = new Date(data.startTime);
    const endTime = new Date(data.endTime);

    // Guard: past slot
    if (startTime < new Date()) {
      const err = new Error("Cannot create a slot in the past.");
      err.statusCode = 400;
      throw err;
    }

    // Guard: time range validity
    if (endTime <= startTime) {
      const err = new Error("End time must be after start time.");
      err.statusCode = 400;
      throw err;
    }

    // Guard: no overlapping slots
    const overlapping = await prisma.slot.findFirst({
      where: {
        doctorId: data.doctorId,
        status: { in: ["AVAILABLE", "BOOKED"] },
        OR: [
          {
            AND: [
              { startTime: { lte: startTime } },
              { endTime: { gt: startTime } },
            ],
          },
          {
            AND: [
              { startTime: { lt: endTime } },
              { endTime: { gte: endTime } },
            ],
          },
          {
            AND: [
              { startTime: { gte: startTime } },
              { endTime: { lte: endTime } },
            ],
          },
        ],
      },
    });

    if (overlapping) {
      const err = new Error("Slot overlaps with an existing slot.");
      err.statusCode = 409;
      throw err;
    }

    return prisma.slot.create({
      data: {
        doctorId: data.doctorId,
        startTime,
        endTime,
        status: data.status || "AVAILABLE",
      },
    });
  }

  /**
   * Bulk create slots or generate them from a schedule.
   *
   * Option A: Provide raw `slots` array.
   * Option B: Provide `schedule` object and `isUpdate = true` to regenerate.
   *           This handles the deletion of existing AVAILABLE slots automatically.
   */
  async createBulk({ doctorId, hospitalId, slots, schedule, isUpdate = false }) {
    // If isUpdate is true, clear existing future AVAILABLE slots first
    if (isUpdate) {
      await prisma.slot.deleteMany({
        where: {
          doctorId,
          status: "AVAILABLE",
          startTime: { gte: new Date() },
          appointments: {
            none: {
              status: { not: "CANCELLED" }
            }
          },
          slotLock: null,
        },
      });
    }

    let finalSlots = slots || [];

    // If schedule is provided, generate slots for the next 60 days
    if (schedule) {
      const from = dayjs().tz(UAE_TZ).startOf("day").toDate();
      const to = dayjs().tz(UAE_TZ).add(60, "day").startOf("day").toDate();
      const generated = this._generateSlotsFromSchedule(
        doctorId,
        schedule,
        from,
        to,
      );
      finalSlots = [...finalSlots, ...generated];
    }

    if (finalSlots.length === 0) return { count: 0 };

    // Validate all slots
    for (const slot of finalSlots) {
      if (new Date(slot.endTime) <= new Date(slot.startTime)) {
        const err = new Error(
          `Invalid time range for slot starting at ${slot.startTime}`,
        );
        err.statusCode = 400;
        throw err;
      }
    }

    const result = await prisma.slot.createMany({
      data: finalSlots.map((slot) => ({
        doctorId: doctorId || slot.doctorId,
        startTime: new Date(slot.startTime),
        endTime: new Date(slot.endTime),
        status: slot.status || "AVAILABLE",
      })),
      skipDuplicates: true,
    });

    return result;
  }

  /**
   * Internal helper to generate slots from a schedule object.
   * Mirrors the logic from hospital-admin-service for consistency.
   */
  _generateSlotsFromSchedule(doctorId, schedule, fromDate, toDate) {
    const DAY_NAME_MAP = {
      0: "SUNDAY",
      1: "MONDAY",
      2: "TUESDAY",
      3: "WEDNESDAY",
      4: "THURSDAY",
      5: "FRIDAY",
      6: "SATURDAY",
    };

    const slots = [];
    const totalDays = dayjs(toDate).diff(dayjs(fromDate), "day");

    for (let i = 0; i < totalDays; i++) {
      const currentDay = dayjs(fromDate).tz(UAE_TZ).add(i, "day");
      const dayName = DAY_NAME_MAP[currentDay.day()];
      const dayConfig = schedule[dayName];

      if (!dayConfig) continue;

      const timeBlocks = this._extractTimeBlocks(dayConfig);

      for (const block of timeBlocks) {
        const [startHour, startMin] = block.startTime.split(":").map(Number);
        const [endHour, endMin] = block.endTime.split(":").map(Number);
        const duration = block.consultationDuration;

        let slotStart = currentDay
          .hour(startHour)
          .minute(startMin)
          .second(0)
          .millisecond(0);
        const blockEnd = currentDay
          .hour(endHour)
          .minute(endMin)
          .second(0)
          .millisecond(0);

        while (slotStart.isBefore(blockEnd)) {
          const slotEnd = slotStart.add(duration, "minute");
          if (slotEnd.isAfter(blockEnd)) break;

          slots.push({
            doctorId,
            startTime: slotStart.toDate(),
            endTime: slotEnd.toDate(),
            status: "AVAILABLE",
          });

          slotStart = slotEnd;
        }
      }
    }
    return slots;
  }

  _extractTimeBlocks(dayConfig) {
    if (Array.isArray(dayConfig.slots)) {
      if (dayConfig.enabled === false) return [];
      return dayConfig.slots.map((s) => ({
        startTime: s.startTime,
        endTime: s.endTime,
        consultationDuration: parseInt(String(s.consultationDuration), 10) || 30,
      }));
    }
    if (dayConfig.from && dayConfig.to) {
      return [
        {
          startTime: dayConfig.from,
          endTime: dayConfig.to,
          consultationDuration: 30,
        },
      ];
    }
    return [];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Update a slot.
   *
   * IMPORTANT: Pre-generated slots must NOT have their times changed after
   * creation — times are set by the schedule generator and are immutable.
   * Only `status` updates are allowed via this method.
   *
   * If you need to change a slot's time, delete it and regenerate via schedule.
   *
   * Guards: slot must exist, must not be in the past.
   */
  async update(id, data) {
    const slot = await this.findById(id);
    if (!slot) {
      const err = new Error("Slot not found.");
      err.statusCode = 404;
      throw err;
    }

    // Guard: past slot
    this._assertNotPast(slot);

    // Guard: reject time changes on pre-generated slots
    if (data.startTime || data.endTime) {
      const err = new Error(
        "Slot times cannot be changed directly. Update the doctor schedule and slots will be regenerated.",
      );
      err.statusCode = 400;
      throw err;
    }

    // Guard: only allow valid status transitions
    const allowedStatuses = ["AVAILABLE", "CANCELLED", "BLOCKED"];
    if (data.status && !allowedStatuses.includes(data.status)) {
      const err = new Error(`Invalid status transition to '${data.status}'.`);
      err.statusCode = 400;
      throw err;
    }

    // Guard: can't un-book a BOOKED slot via this method — use appointment cancel flow
    if (slot.status === "BOOKED" && data.status && data.status !== "BOOKED") {
      const err = new Error(
        "Cannot change status of a BOOKED slot directly. Use the appointment cancellation flow.",
      );
      err.statusCode = 400;
      throw err;
    }

    return prisma.slot.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Delete a single slot.
   * Guards: must exist, must not be BOOKED, must not be in the past.
   */
  async delete(id) {
    const slot = await this.findById(id);
    if (!slot) {
      const err = new Error("Slot not found.");
      err.statusCode = 404;
      throw err;
    }

    // Guard: past slot — no point deleting, cron handles it; but reject explicit calls
    this._assertNotPast(slot);

    // Guard: booked slots cannot be deleted
    if (slot.status === "BOOKED" || slot.appointments.length > 0) {
      const err = new Error(
        "Cannot delete a booked slot. Cancel the appointment first.",
      );
      err.statusCode = 400;
      throw err;
    }

    return prisma.slot.delete({ where: { id } });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // LOCKING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Lock a slot to prevent double-booking during the booking flow.
   * Lock expires after `expiresInMinutes` (default 5 min).
   * Guards: slot must exist, must be AVAILABLE, must not be in the past.
   */
  async lockSlot(slotId, lockedBy, expiresInMinutes = 5) {
    const slot = await this.findById(slotId);
    if (!slot) {
      const err = new Error("Slot not found.");
      err.statusCode = 404;
      throw err;
    }

    // Guard: past slot
    this._assertNotPast(slot);

    // Guard: only AVAILABLE slots can be locked
    this._assertAvailable(slot);

    // Clean up expired locks first
    await this.cleanExpiredLocks();

    // Check if slot already has an active lock
    const existingLock = await prisma.slotLock.findUnique({
      where: { slotId },
    });
    if (existingLock && existingLock.expiresAt > new Date()) {
      const err = new Error(
        "Slot is already locked by another user. Please try again shortly.",
      );
      err.statusCode = 409;
      throw err;
    }

    const expiresAt = dayjs().add(expiresInMinutes, "minute").toDate();

    return prisma.slotLock.upsert({
      where: { slotId },
      update: { lockedBy, expiresAt },
      create: { slotId, lockedBy, expiresAt },
    });
  }

  /**
   * Unlock a slot (idempotent: no-op if no lock exists).
   */
  async unlockSlot(slotId) {
    return prisma.slotLock.deleteMany({ where: { slotId } });
  }

  /**
   * Clean up all expired slot locks.
   */
  async cleanExpiredLocks() {
    return prisma.slotLock.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CRON HELPERS
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Delete past AVAILABLE slots that were never booked.
   * Called by the nightly maintenance cron.
   *
   * Safe to delete because:
   *   - status = AVAILABLE  → no appointment is attached
   *   - startTime < now     → the slot time has passed
   *   - appointments: none  → double-check no appointment row references it
   *   - slotLock: null      → not currently being booked (expired locks cleared first)
   */
  async deletePastAvailableSlots() {
    const now = new Date();
    await this.cleanExpiredLocks();

    const pastAvailable = await prisma.slot.findMany({
      where: {
        status: "AVAILABLE",
        startTime: { lt: now },
        appointments: {
          none: {
            status: { not: "CANCELLED" }
          }
        },
        slotLock: null,
      },
      select: { id: true },
    });

    if (pastAvailable.length === 0) return { deleted: 0 };

    const ids = pastAvailable.map((s) => s.id);
    await prisma.slot.deleteMany({ where: { id: { in: ids } } });
    return { deleted: ids.length };
  }

  /**
   * Extend slots for a single doctor to ensure the rolling 60-day window is
   * always maintained. Called by the nightly cron for every active doctor.
   *
   * Logic:
   *   1. Find the furthest existing slot for this doctor.
   *   2. If furthest slot < today + 60 days, generate slots to fill the gap.
   *   3. Uses the same slot generation logic as initial doctor creation.
   *
   * @param {string}              doctorId
   * @param {string}              hospitalId
   * @param {Record<string, any>} schedule   - raw schedule JSON from profile-service
   * @param {Function}            generateFn - reference to DoctorService.generateSlotsInRange
   */
  async extendSlotsForDoctor(doctorId, hospitalId, schedule, generateFn) {
    const sixtyDaysFromNow = dayjs().tz(UAE_TZ).add(60, "day").startOf("day");

    // Find the last slot we have for this doctor
    const lastSlot = await prisma.slot.findFirst({
      where: { doctorId },
      orderBy: { startTime: "desc" },
      select: { startTime: true },
    });

    // Start generating from the day after the last slot (or today if none)
    const generateFrom = lastSlot
      ? dayjs(lastSlot.startTime).tz(UAE_TZ).add(1, "day").startOf("day")
      : dayjs().tz(UAE_TZ).startOf("day");

    // Nothing to do if we're already covered
    if (!generateFrom.isBefore(sixtyDaysFromNow)) return { generated: 0 };

    return generateFn(
      doctorId,
      hospitalId,
      schedule,
      generateFrom.toDate(),
      sixtyDaysFromNow.toDate(),
    );
  }
}

module.exports = new SlotService();
