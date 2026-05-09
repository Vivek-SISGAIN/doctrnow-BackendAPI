/**
 * BullMQ Notification Queue
 *
 * Uses Redis (already running in the environment) to schedule appointment
 * reminder jobs with exact delay timestamps. This completely replaces the
 * previous RabbitMQ TTL-based approach which suffered from Head-of-Line blocking.
 *
 * Job naming convention:  reminder_<TYPE>_<appointmentId>
 * e.g. reminder_15m_abc123, reminder_3m_abc123, reminder_1m_abc123
 */
const { Queue, Worker, QueueEvents } = require("bullmq");

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  password: process.env.REDIS_PASSWORD || undefined,
};

const QUEUE_NAME = "appointment-notifications";

// ---------------------------------------------------------------------------
// Queue — used to add / remove jobs
// ---------------------------------------------------------------------------
const notificationQueue = new Queue(QUEUE_NAME, {
  connection: REDIS_CONNECTION,
  defaultJobOptions: {
    removeOnComplete: true,   // keep Redis lean
    removeOnFail: 50,         // keep last 50 failed jobs for debugging
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

// ---------------------------------------------------------------------------
// Schedule helpers
// ---------------------------------------------------------------------------

/**
 * Calculate delay (ms) from now until `targetTime - minutesBefore`.
 * Returns null if the target time has already passed.
 */
function calcDelay(startTimeISO, minutesBefore) {
  const fireAt = new Date(startTimeISO).getTime() - minutesBefore * 60 * 1000;
  const delay = fireAt - Date.now();
  return delay > 0 ? delay : null;
}

/**
 * Schedule all reminder jobs for a newly-booked/confirmed appointment.
 * Any reminder whose fire time has already passed is silently skipped.
 *
 * @param {object} appointment  - Full appointment object with `slot.startTime`
 */
async function scheduleAppointmentReminders(appointment) {
  const startTime = appointment?.slot?.startTime;
  if (!startTime) {
    console.warn(`[NotificationQueue] No slot start time for appointment ${appointment?.id}; skipping reminders.`);
    return;
  }

  const id = appointment.id;

  const reminders = [
    // Patient reminders
    { jobId: `reminder_15m_patient_${id}`, type: "APPOINTMENT_REMINDER_15", role: "PATIENT", minutesBefore: 15 },
    { jobId: `reminder_5m_patient_${id}`,  type: "APPOINTMENT_LOCK_5M",      role: "PATIENT", minutesBefore: 5 },
    { jobId: `reminder_3m_patient_${id}`,  type: "APPOINTMENT_REMINDER_3",  role: "PATIENT", minutesBefore: 3 },
    { jobId: `reminder_1m_patient_${id}`,  type: "APPOINTMENT_JOIN_1M",     role: "PATIENT", minutesBefore: 1 },

    // Doctor reminders
    { jobId: `reminder_5m_doctor_${id}`,   type: "APPOINTMENT_APPROACHING", role: "DOCTOR",  minutesBefore: 5 },
    { jobId: `reminder_1m_doctor_${id}`,   type: "APPOINTMENT_REMINDER_1",  role: "DOCTOR",  minutesBefore: 1 },
    { jobId: `reminder_15s_doctor_${id}`,  type: "APPOINTMENT_STARTING_NOW",role: "DOCTOR",  minutesBefore: 0.25 }, // 15 sec
  ];

  for (const r of reminders) {
    const delay = calcDelay(startTime, r.minutesBefore);
    if (delay === null) {
      console.log(`[NotificationQueue] Skipping ${r.jobId} — fire time already passed.`);
      continue;
    }

    await notificationQueue.add(
      "send-reminder",
      { appointmentId: id, reminderType: r.type, targetRole: r.role },
      { jobId: r.jobId, delay }
    );
    console.log(`[NotificationQueue] Scheduled ${r.jobId} in ${Math.round(delay / 1000)}s`);
  }

  // No-show check: 10 minutes after start time
  const noShowDelay = calcDelay(startTime, -10); // -10 = 10 min AFTER start
  if (noShowDelay !== null) {
    await notificationQueue.add(
      "no-show-check",
      { appointmentId: id },
      { jobId: `no_show_${id}`, delay: noShowDelay }
    );
    console.log(`[NotificationQueue] Scheduled no-show check for ${id} in ${Math.round(noShowDelay / 1000)}s`);
  }
}

/**
 * Remove all scheduled reminder jobs for a cancelled / rescheduled appointment.
 * This is the key benefit over RabbitMQ — ghost notifications are instantly eliminated.
 *
 * @param {string} appointmentId
 */
async function cancelAppointmentReminders(appointmentId) {
  const jobIds = [
    `reminder_15m_patient_${appointmentId}`,
    `reminder_5m_patient_${appointmentId}`,
    `reminder_3m_patient_${appointmentId}`,
    `reminder_1m_patient_${appointmentId}`,
    `reminder_5m_doctor_${appointmentId}`,
    `reminder_1m_doctor_${appointmentId}`,
    `reminder_15s_doctor_${appointmentId}`,
    `no_show_${appointmentId}`,
  ];

  let removed = 0;
  for (const jobId of jobIds) {
    const job = await notificationQueue.getJob(jobId);
    if (job) {
      await job.remove();
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`[NotificationQueue] Removed ${removed} scheduled reminder(s) for appointment ${appointmentId}`);
  }
}

// ---------------------------------------------------------------------------
// Worker — processes jobs dispatched by the queue
// ---------------------------------------------------------------------------
function startNotificationWorker() {
  const schedulerService = require("../service/scheduler.service");
  const prisma = require("../prisma/prisma");

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === "send-reminder") {
        const { appointmentId, reminderType, targetRole } = job.data;

        // Re-fetch from DB to check live status (handles cancellations / reschedules)
        const appointment = await prisma.appointment.findUnique({
          where: { id: appointmentId },
          include: { slot: true },
        });

        if (!appointment) {
          console.log(`[NotificationQueue] Appointment ${appointmentId} not found; skipping ${reminderType}.`);
          return;
        }

        if (!["CONFIRMED", "PENDING"].includes(appointment.status)) {
          console.log(`[NotificationQueue] Appointment ${appointmentId} is ${appointment.status}; skipping ${reminderType}.`);
          return;
        }

        await schedulerService.triggerReminder(appointment, targetRole, reminderType);
        console.log(`[NotificationQueue] Delivered ${reminderType} to ${targetRole} for appointment ${appointmentId}`);

      } else if (job.name === "no-show-check") {
        const { appointmentId } = job.data;

        const appointment = await prisma.appointment.findUnique({
          where: { id: appointmentId },
          include: { slot: true },
        });

        if (!appointment) return;
        if (!["CONFIRMED", "PENDING"].includes(appointment.status)) return;

        await schedulerService.triggerNoShowCheck(appointment);
      }
    },
    { connection: REDIS_CONNECTION, concurrency: 5 }
  );

  worker.on("completed", (job) => {
    console.log(`[NotificationQueue] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[NotificationQueue] Job ${job?.id} failed:`, err.message);
  });

  console.log("[NotificationQueue] Worker started — listening for reminder jobs");
  return worker;
}

module.exports = {
  notificationQueue,
  scheduleAppointmentReminders,
  cancelAppointmentReminders,
  startNotificationWorker,
};
