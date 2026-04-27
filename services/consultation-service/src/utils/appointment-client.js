const API_GATEWAY_URL = process.env.BASE_URL || process.env.API_GATEWAY_URL || "http://localhost:8080/api/v1/";
const gatewayBaseUrl = () => API_GATEWAY_URL.endsWith("/") ? API_GATEWAY_URL : `${API_GATEWAY_URL}/`;

class AppointmentClient {
  async getAppointmentById(appointmentId) {
    if (!appointmentId) {
      return null;
    }

    try {
      const response = await fetch(`${gatewayBaseUrl()}appointments/${encodeURIComponent(appointmentId)}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.INTERNAL_SERVICE_SECRET
            ? { "x-internal-service-key": process.env.INTERNAL_SERVICE_SECRET }
            : {}),
          ...(process.env.INTERNAL_SECRET ? { "x-internal-secret": process.env.INTERNAL_SECRET } : {}),
        }
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
