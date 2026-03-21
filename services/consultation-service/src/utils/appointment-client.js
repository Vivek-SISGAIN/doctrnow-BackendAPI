const APPOINTMENT_SERVICE_URL = process.env.APPOINTMENT_SERVICE_URL || "http://localhost:3003";

class AppointmentClient {
  async getAppointmentById(appointmentId) {
    if (!appointmentId) {
      return null;
    }

    try {
      const response = await fetch(`${APPOINTMENT_SERVICE_URL}/api/appointments/${appointmentId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });

      if (!response.ok) {
        return null;
      }

      const result = await response.json();
      return result.data ?? null;
    } catch (err) {
      console.warn("Appointment service unreachable", { appointmentId, error: err.message });
      return null;
    }
  }
}

module.exports = new AppointmentClient();
