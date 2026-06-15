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
    `[SlotCron] Starting rolling-window maintenance at ${dayjs().tz(UAE_TZ).format("YYYY-MM-DD HH:mm")} UAE`,
  );

  // ── Step 1: Delete AVAILABLE slots from yesterday (UAE time) ─────────────
  // This is the new targeted delete — only yesterday's unbooked slots.
  // The old deletePastAvailableSlots() deleted ALL past available slots;
  // we now delegate that work to the new per-day method.
  const { deleted, date: deletedDate } = await slotService.deleteYesterdayAvailableSlots();
  console.log(
    `[SlotCron] Deleted ${deleted} unbooked AVAILABLE slots from ${deletedDate}`,
  );

  // ── Step 2: Fetch all active doctors ─────────────────────────────────────
  // NOTE: doctor records are in profile-service. Fetch via Gateway or internal URL.
  let doctors = [];
  try {
    const gatewayUrl = process.env.BASE_URL; // e.g. http://localhost:8080/api/v1/
    if (!gatewayUrl) throw new Error("BASE_URL not configured");

    const baseUrl = gatewayUrl.endsWith("/") ? gatewayUrl : `${gatewayUrl}/`;
    const url = `${baseUrl}profiles/doctors?status=ACTIVE`;

    const res = await axios.get(url, {
      headers: {
        ...(process.env.INTERNAL_SERVICE_SECRET
          ? { "x-internal-service-key": process.env.INTERNAL_SERVICE_SECRET }
          : {}),
      },
      timeout: 5000,
    });

    doctors = res.data?.data || [];
  } catch (err) {
    console.error(`[SlotCron] Failed to fetch active doctors from profile-service: ${err.message}`);
    return; // Cannot proceed without doctor list
  }

  console.log(
    `[SlotCron] Extending by one day for ${doctors.length} active doctors`,
  );

  let totalGenerated = 0;
  let totalSkipped   = 0;

  // ── Step 3: For each doctor, extend slots by exactly one day ─────────────
  for (const doctor of doctors) {
    if (!doctor.schedule) {
      totalSkipped++;
      continue;
    }

    try {
      const { generated, newDate } = await slotService.extendSlotsByOneDay(
        doctor.id,
        doctor.schedule,
      );

      if (generated > 0) {
        console.log(
          `[SlotCron] Doctor ${doctor.id}: +${generated} slots on ${newDate}`,
        );
        totalGenerated += generated;
      } else if (newDate) {
        // Doctor has no working hours on that day (e.g. Friday off)
        console.log(
          `[SlotCron] Doctor ${doctor.id}: no working hours on ${newDate} — skipped`,
        );
      }
    } catch (err) {
      // One doctor failing must not stop the rest
      console.error(
        `[SlotCron] Failed to extend slots for doctor ${doctor.id}: ${err.message}`,
      );
    }
  }

  console.log(
    `[SlotCron] Done. Deleted: ${deleted} (${deletedDate}), Generated: ${totalGenerated}, Skipped (no schedule): ${totalSkipped}`,
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
