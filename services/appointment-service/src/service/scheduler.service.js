// SchedulerService — dispatches appointment notifications via HTTP to the notification service.
// Does NOT depend on any RabbitMQ delay infrastructure (that is handled by BullMQ now).
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
dayjs.extend(utc);
const axios = require("axios");
const prisma = require("../prisma/prisma");

const profileUserIdCache = {
  DOCTOR: new Map(),
  PATIENT: new Map(),
};

class SchedulerService {
  formatPersonName(profile, fallback) {
    if (!profile) return fallback;
    return (
      profile.fullName ||
      [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim() ||
      profile.name ||
      fallback
    );
  }

  formatAppointmentTime(appointment) {
    const start = appointment?.slot?.startTime;
    if (!start) return "the scheduled time";
    return dayjs(start).format("DD MMM YYYY, hh:mm A");
  }

  async fetchAppointmentContext(appointment) {
    const fallbackPatientName = `Patient ${String(appointment.patientId || "").slice(0, 8)}`;
    const fallbackDoctorName = `Doctor ${String(appointment.doctorId || "").slice(0, 8)}`;
    const baseUrl = process.env.BASE_URL;

    const context = {
      patient: null,
      doctor: null,
      patientName: fallbackPatientName,
      doctorName: fallbackDoctorName,
      appointmentTime: this.formatAppointmentTime(appointment),
    };

    if (!baseUrl) return context;

    const gatewayBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const headers = {
      "Content-Type": "application/json",
      ...(process.env.INTERNAL_SERVICE_SECRET
        ? { "x-internal-service-key": process.env.INTERNAL_SERVICE_SECRET }
        : {}),
      ...(process.env.INTERNAL_SECRET ? { "x-internal-secret": process.env.INTERNAL_SECRET } : {}),
    };

    try {
      const [doctorRes, patientRes] = await Promise.all([
        axios.post(
          `${gatewayBase}profiles/doctors/bulk`,
          { ids: [appointment.doctorId].filter(Boolean) },
          { headers, timeout: 3000 }
        ),
        axios.post(
          `${gatewayBase}profiles/patients/bulk`,
          { ids: [appointment.patientId].filter(Boolean) },
          { headers, timeout: 3000 }
        ),
      ]);

      context.doctor = doctorRes.data?.data?.[appointment.doctorId] || null;
      context.patient = patientRes.data?.data?.[appointment.patientId] || null;
      context.doctorName = this.formatPersonName(context.doctor, fallbackDoctorName);
      context.patientName = this.formatPersonName(context.patient, fallbackPatientName);
    } catch (error) {
      console.warn("[SchedulerService] Failed to enrich appointment notification context:", error.message);
    }

    return context;
  }

  buildNotificationPayload(appointment, payload = {}) {
    return {
      appointmentId: appointment.id,
      doctorId: appointment.doctorId,
      patientId: appointment.patientId,
      hospitalId: appointment.hospitalId,
      appointmentTime: appointment.slot?.startTime,
      ...payload,
    };
  }

  /**
   * Called by the notification cron job to trigger specific reminders
   */
  async triggerReminder(appointment, targetRole, reminderType) {
    const context = await this.fetchAppointmentContext(appointment);

    let title, body;

    switch (reminderType) {
      case "PAYMENT_REMINDER":
        title = "Payment Due";
        body = `Payment is due for your appointment with Dr. ${context.doctorName} at ${context.appointmentTime}.`;
        break;
      case "APPOINTMENT_REMINDER_15":
        title = "Appointment Reminder";
        body = `Your doctor will join in 15 minutes. Please join on time.`;
        break;
      case "APPOINTMENT_REMINDER_3":
        title = "Join Virtual Lobby";
        body = `Your doctor will join in 3 minutes. Please join the virtual lobby.`;
        break;
      case "APPOINTMENT_APPROACHING":
        title = "Appointment Starting Soon";
        body = `Appointment with ${context.patientName} starts in 5 minutes.`;
        break;
      case "APPOINTMENT_REMINDER_1":
        title = "Join Now";
        body = `Appointment with ${context.patientName} starts in 1 minute. Please join now.`;
        break;
      case "APPOINTMENT_STARTING_NOW":
        title = "Session Starting";
        body = `Your session with ${context.patientName} is starting. Initiating connection...`;
        break;
      default:
        console.warn(`[SchedulerService] Unknown reminder type: ${reminderType}`);
        return;
    }

    await this.notifyAppointmentParty(appointment, targetRole, title, body, {
      type: reminderType,
      context,
    });
  }

  /**
   * Called by the notification cron job to perform the 10-minute auto no-show check
   */
  async triggerNoShowCheck(appointment) {
    console.log(`[SchedulerService] Executing No-Show check for appointment ${appointment.id}`);
    
    // Appointment is passed from the cron job if it is still CONFIRMED or PENDING 10 mins after start time
    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: "NO_SHOW" },
      include: { slot: true },
    });
    
    console.log(`[SchedulerService] Appointment ${appointment.id} automatically marked as NO_SHOW`);

    const context = await this.fetchAppointmentContext(updated);
    const notifyPayload = {
      status: "NO_SHOW",
      type: "APPOINTMENT_NO_SHOW",
      doctorName: context.doctorName,
      patientName: context.patientName,
    };
    
    await this.notifyAppointmentParty(
      updated,
      "DOCTOR",
      "Appointment No-Show",
      `${context.patientName} did not attend the appointment scheduled for ${context.appointmentTime}.`,
      notifyPayload
    );
    await this.notifyAppointmentParty(
      updated,
      "PATIENT",
      "Appointment No-Show",
      `Your appointment with Dr. ${context.doctorName} was marked as no-show.`,
      notifyPayload
    );
  }

  async resolveAuthUserId(profileId, role) {
    if (!profileId || role === "SYSTEM") return profileId;

    const normalizedRole = String(role).toUpperCase();
    const cache = profileUserIdCache[normalizedRole];
    if (cache?.has(profileId)) return cache.get(profileId);

    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
      console.warn("[SchedulerService] BASE_URL is not configured; using profile id as notification user id");
      return profileId;
    }

    const path = normalizedRole === "DOCTOR" ? "profiles/doctors" : "profiles/patients";
    const url = `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}${path}/${encodeURIComponent(profileId)}`;

    try {
      const response = await axios.get(url, {
        headers: {
          ...(process.env.INTERNAL_SERVICE_SECRET
            ? { "x-internal-service-key": process.env.INTERNAL_SERVICE_SECRET }
            : {}),
          ...(process.env.INTERNAL_SECRET
            ? { "x-internal-secret": process.env.INTERNAL_SECRET }
            : {}),
        },
        timeout: 3000,
      });
      const profile = response.data?.data ?? response.data;
      const userId = profile?.userId || profileId;
      cache?.set(profileId, userId);
      return userId;
    } catch (error) {
      console.error(`[SchedulerService] Failed to resolve ${normalizedRole} user id for ${profileId}:`, error.message);
      return profileId;
    }
  }

  /**
   * Send an immediate in-app notification via HTTP to the notification service.
   * This is the single, stable path for all notification dispatch — no RabbitMQ required.
   */
  async sendImmediateNotification(userId, title, body, payload = {}) {
    const targetRole = payload.targetRole || payload.role;
    const resolvedUserId = targetRole
      ? await this.resolveAuthUserId(userId, targetRole)
      : userId;

    const baseUrl = process.env.BASE_URL || "http://localhost:8080/api/v1/";
    const url = `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}notifications/single`;

    const data = {
      userId: resolvedUserId,
      channels: ["IN_APP"],
      title,
      body,
      payload,
    };

    try {
      await axios.post(url, data, {
        headers: {
          "Content-Type": "application/json",
          ...(process.env.INTERNAL_SERVICE_SECRET
            ? { "x-internal-service-key": process.env.INTERNAL_SERVICE_SECRET }
            : {}),
        },
        timeout: 5000,
      });
      console.log(`[SchedulerService] Sent notification to ${resolvedUserId}: ${title}`);
    } catch (err) {
      console.error(`[SchedulerService] Failed to send notification to ${resolvedUserId}:`, err.message);
    }
  }

  async notifyAppointmentParty(appointment, targetRole, title, body, payload = {}) {
    const targetUserId = targetRole === "DOCTOR" ? appointment.doctorId : appointment.patientId;
    return this.sendImmediateNotification(
      targetUserId,
      title,
      body,
      this.buildNotificationPayload(appointment, { ...payload, targetRole })
    );
  }
}

module.exports = new SchedulerService();
