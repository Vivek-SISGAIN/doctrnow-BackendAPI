const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:8080/api/v1';
const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || process.env.INTERNAL_SERVICE_SECRET;

class PrescriptionNotificationService {
  async fetchBulk(ids, path) {
    if (!ids || ids.length === 0) return {};

    try {
      const response = await fetch(`${API_GATEWAY_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(INTERNAL_SERVICE_KEY ? { 'x-internal-service-key': INTERNAL_SERVICE_KEY } : {}),
          ...(INTERNAL_SERVICE_KEY ? { 'x-internal-secret': INTERNAL_SERVICE_KEY } : {})
        },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) return {};
      const json = await response.json();
      return json.data || {};
    } catch (error) {
      console.warn(`[PrescriptionNotificationService] Bulk fetch failed for ${path}:`, error.message);
      return {};
    }
  }

  async resolvePatientUserId(patientId) {
    const map = await this.fetchBulk([patientId], '/profiles/patients/bulk');
    return map[patientId]?.userId || patientId;
  }

  async resolveDoctor(doctorId) {
    const map = await this.fetchBulk([doctorId], '/profiles/doctors/bulk');
    return map[doctorId] || null;
  }

  async sendPrescriptionEmail({ to, patientName, doctorName, facilityName, rxId, pdfBuffer }) {
    console.log(`[PrescriptionNotificationService] Sending prescription email to ${to} for Rx ${rxId} via Gateway`);
    
    const response = await fetch(`${API_GATEWAY_URL}/notifications/email/prescription`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(INTERNAL_SERVICE_KEY ? { 'x-internal-service-key': INTERNAL_SERVICE_KEY } : {}),
        ...(INTERNAL_SERVICE_KEY ? { 'x-internal-secret': INTERNAL_SERVICE_KEY } : {})
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

  async sendPrescriptionInAppNotification({ userId, patientName, doctorName, rxId }) {
    const recipientUserId = await this.resolvePatientUserId(userId);
    console.log(`[PrescriptionNotificationService] Sending in-app notification to patient ${recipientUserId} for Rx ${rxId}`);

    const response = await fetch(`${API_GATEWAY_URL}/notifications/single`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(INTERNAL_SERVICE_KEY ? { 'x-internal-service-key': INTERNAL_SERVICE_KEY } : {}),
        ...(INTERNAL_SERVICE_KEY ? { 'x-internal-secret': INTERNAL_SERVICE_KEY } : {})
      },
      body: JSON.stringify({
        userId: recipientUserId,
        channels: ['IN_APP'],
        title: 'New Prescription Issued',
        body: `Dr. ${doctorName} has issued a new prescription (${rxId}) for ${patientName}.`,
        payload: {
          type: 'prescription',
          rxId,
        }
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[PrescriptionNotificationService] Failed to send in-app notification: ${response.status}`, body);
      return null;
    }

    return response.json();
  }

  async sendLabReportNotification({ userId, patientName, doctorName, reportId, doctorId, hospitalId }) {
    const recipientUserId = await this.resolvePatientUserId(userId);
    console.log(`[PrescriptionNotificationService] Sending in-app notification to patient ${recipientUserId} for Lab Report ${reportId}`);

    const response = await fetch(`${API_GATEWAY_URL}/notifications/single`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(INTERNAL_SERVICE_KEY ? { 'x-internal-service-key': INTERNAL_SERVICE_KEY } : {}),
        ...(INTERNAL_SERVICE_KEY ? { 'x-internal-secret': INTERNAL_SERVICE_KEY } : {})
      },
      body: JSON.stringify({
        userId: recipientUserId,
        channels: ['IN_APP'],
        title: 'Lab Report Available',
        body: `Your lab report (${reportId}) ordered by Dr. ${doctorName} is now available.`,
        payload: {
          type: 'lab_report',
          reportId,
          doctorId,
          hospitalId,
        }
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[PrescriptionNotificationService] Failed to send lab report notification: ${response.status}`, body);
      return null;
    }

    if (hospitalId) {
      this.sendHospitalLabReportNotification({
        hospitalId,
        patientName,
        doctorName,
        reportId,
        doctorId,
      }).catch(err => {
        console.error(`[PrescriptionNotificationService] Failed to notify hospital admins for lab report:`, err.message);
      });
    }

    return response.json();
  }

  async sendHospitalLabReportNotification({ hospitalId, patientName, doctorName, reportId, doctorId }) {
    const response = await fetch(`${API_GATEWAY_URL}/notifications/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(INTERNAL_SERVICE_KEY ? { 'x-internal-service-key': INTERNAL_SERVICE_KEY } : {}),
        ...(INTERNAL_SERVICE_KEY ? { 'x-internal-secret': INTERNAL_SERVICE_KEY } : {})
      },
      body: JSON.stringify({
        roles: ['HOSPITAL_ADMIN'],
        hospitalId,
        channels: ['IN_APP'],
        title: 'Lab Report Available',
        body: `Lab report ${reportId} for ${patientName || 'patient'} is available for Dr. ${doctorName}.`,
        payload: {
          type: 'lab_report',
          reportId,
          doctorId,
          hospitalId,
        }
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[PrescriptionNotificationService] Failed to send hospital lab report notification: ${response.status}`, body);
      return null;
    }

    return response.json();
  }
}

module.exports = new PrescriptionNotificationService();
