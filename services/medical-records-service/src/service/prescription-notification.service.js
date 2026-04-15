const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:4000';

class PrescriptionNotificationService {
  async sendPrescriptionEmail({ to, patientName, doctorName, facilityName, rxId, pdfBuffer }) {
    console.log(`[PrescriptionNotificationService] Sending prescription email to ${to} for Rx ${rxId}`);
    const response = await fetch(`${NOTIFICATION_SERVICE_URL}/api/emails/prescription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
