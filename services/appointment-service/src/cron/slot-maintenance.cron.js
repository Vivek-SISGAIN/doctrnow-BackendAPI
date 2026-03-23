/**
 * slot-maintenance.cron.js
 * appointment-service
 *
 * Runs nightly at 2AM UAE time (22:00 UTC).
 * Does two things in one pass:
 *   1. Delete past AVAILABLE slots (table hygiene)
 *   2. Extend slots for every active doctor to maintain the rolling 60-day window
 *
 * Setup: use node-cron (already common in Express/Node services).
 * Install: npm install node-cron
 *
 * Wire up in your app entry point (app.js / server.js):
 *   require('./cron/slot-maintenance.cron');
 */

const cron = require("node-cron");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
const axios = require("axios");
const slotService = require("../service/slot.service");
const prisma = require("../prisma/prisma");

dayjs.extend(utc);
dayjs.extend(timezone);

const UAE_TZ = "Asia/Dubai";

const DAY_NAME_MAP = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

// ─────────────────────────────────────────────────────────────────────────────
// SLOT GENERATION (mirrors DoctorService.generateSlotsInRange)
// Kept here so the cron has no dependency on hospital-admin-service.
// ─────────────────────────────────────────────────────────────────────────────

function extractTimeBlocks(dayConfig) {
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

async function generateSlotsInRange(doctorId, schedule, fromDate, toDate) {
  const slots = [];
  const totalDays = dayjs(toDate).diff(dayjs(fromDate), "day");

  for (let i = 0; i < totalDays; i++) {
    const currentDay = dayjs(fromDate).tz(UAE_TZ).add(i, "day");
    const dayName = DAY_NAME_MAP[currentDay.day()];
    const dayConfig = schedule[dayName];

    if (!dayConfig) continue;

    const timeBlocks = extractTimeBlocks(dayConfig);

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

  if (slots.length === 0) return { generated: 0 };

  const result = await prisma.slot.createMany({
    data: slots,
    skipDuplicates: true,
  });

  return { generated: result.count };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CRON TASK
// ─────────────────────────────────────────────────────────────────────────────

async function runSlotMaintenance() {
  console.log(
    `[SlotCron] Starting maintenance at ${dayjs().tz(UAE_TZ).format("YYYY-MM-DD HH:mm")} UAE`,
  );

  // ── Step 1: Delete past AVAILABLE slots ──────────────────────────────────
  const { deleted } = await slotService.deletePastAvailableSlots();
  console.log(`[SlotCron] Deleted ${deleted} past AVAILABLE slots`);

  // ── Step 2: Fetch all active doctors ─────────────────────────────────────
  // NOTE: schedule is stored as JSON on the doctor record in profile-service.
  // If your appointment-service DB does not have doctor records, call the
  // profile-service API here instead of querying prisma directly.
  //
  // Option A — if appointment-service has access to doctor records:
  const doctors = await prisma.doctor.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, hospitalId: true, schedule: true },
  });

  // Option B — if you need to call profile-service (uncomment and remove Option A):
  // const res = await axios.get(`${process.env.PROFILE_SERVICE_URL}/internal/doctors/active`);
  // const doctors = res.data?.data ?? [];

  console.log(
    `[SlotCron] Extending slots for ${doctors.length} active doctors`,
  );

  const sixtyDaysFromNow = dayjs().tz(UAE_TZ).add(60, "day").startOf("day");
  let totalGenerated = 0;

  for (const doctor of doctors) {
    if (!doctor.schedule) continue;

    try {
      // Find the furthest existing future slot for this doctor
      const lastSlot = await prisma.slot.findFirst({
        where: { doctorId: doctor.id, startTime: { gte: new Date() } },
        orderBy: { startTime: "desc" },
        select: { startTime: true },
      });

      // Start from the day after the last slot (or today if none)
      const generateFrom = lastSlot
        ? dayjs(lastSlot.startTime).tz(UAE_TZ).add(1, "day").startOf("day")
        : dayjs().tz(UAE_TZ).startOf("day");

      // Nothing to fill if already covered
      if (!generateFrom.isBefore(sixtyDaysFromNow)) continue;

      const { generated } = await generateSlotsInRange(
        doctor.id,
        doctor.schedule,
        generateFrom.toDate(),
        sixtyDaysFromNow.toDate(),
      );

      if (generated > 0) {
        console.log(
          `[SlotCron] Doctor ${doctor.id}: +${generated} slots (${generateFrom.format("MMM D")} → ${sixtyDaysFromNow.format("MMM D")})`,
        );
        totalGenerated += generated;
      }
    } catch (err) {
      // One doctor failing must not stop the rest
      console.error(
        `[SlotCron] Failed to extend slots for doctor ${doctor.id}:`,
        err.message,
      );
    }
  }

  console.log(
    `[SlotCron] Done. Deleted: ${deleted}, Generated: ${totalGenerated}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE
// 2AM UAE = 22:00 UTC (UAE is UTC+4)
// Cron: '0 22 * * *'
// ─────────────────────────────────────────────────────────────────────────────

cron.schedule(
  "0 22 * * *",
  () => {
    runSlotMaintenance().catch((err) => {
      console.error(
        "[SlotCron] Unhandled error in maintenance job:",
        err.message,
      );
    });
  },
  {
    timezone: "UTC",
  },
);

console.log(
  "[SlotCron] Slot maintenance cron registered — runs daily at 2AM UAE (22:00 UTC)",
);
