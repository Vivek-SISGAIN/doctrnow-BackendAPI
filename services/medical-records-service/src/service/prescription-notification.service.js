const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:8080/api/v1';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY;

class PrescriptionNotificationService {
  async sendPrescriptionEmail({ to, patientName, doctorName, facilityName, rxId, pdfBuffer }) {
    console.log(`[PrescriptionNotificationService] Sending prescription email to ${to} for Rx ${rxId} via Gateway`);
    
    const response = await fetch(`${API_GATEWAY_URL}/notifications/email/prescription`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-internal-service-key': INTERNAL_SERVICE_KEY
      },
      body: JSON.stringify({
        to,
        patientName,
        doctorName,
        facilityName,
        rxId,
        attachments: [
          {
            filename: `${rxId}.pdf`,
            contentBase64: pdfBuffer.toString('base64'),
            contentType: 'application/pdf',
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[PrescriptionNotificationService] Failed to notify notification-service: ${response.status}`, body);
      throw new Error(`Notification service error ${response.status}: ${body}`);
    }

    console.log(`[PrescriptionNotificationService] Prescription email sent successfully to ${to}`);
    return response.json();
  }
}

module.exports = new PrescriptionNotificationService();
