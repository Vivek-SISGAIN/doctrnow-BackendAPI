const axios = require('axios');

const API_GATEWAY = process.env.API_BASE_URL || 'http://localhost:8080/api/v1';
const INTERNAL_SERVICE_SECRET = process.env.INTERNAL_SERVICE_SECRET || 'super_secret_internal_key_123';

const jwt = require('jsonwebtoken');

const extractActor = (req) => {
  let userId = req.headers['x-user-id'] || req.user?.id || req.user?.userId;
  let userRole = req.headers['x-user-role'] || req.user?.role;
  let hospitalId = req.headers['x-hospital-id'] || req.headers['x-tenant-id'] || req.user?.hospitalId || req.user?.tenantId;

  if ((!userId || !hospitalId) && req.headers.authorization) {
    try {
      const token = req.headers.authorization.replace(/^Bearer\s+/i, '');
      const decoded = jwt.decode(token);
      if (decoded) {
        userId = userId || decoded.userId || decoded.id || decoded.sub;
        userRole = userRole || decoded.role;
        hospitalId = hospitalId || decoded.hospitalId || decoded.tenantId;
      }
    } catch {}
  }
  return {
    userId: userId || 'admin',
    userRole: userRole || 'SUPER_ADMIN',
    hospitalId: hospitalId || null,
  };
};

const publishAuditEvent = async (event) => {
  try {
    const payload = {
      timestamp: new Date().toISOString(),
      service: 'profile-service',
      hospitalId: event.hospitalId,
      entityType: event.entityType || 'DOCTOR',
      actionPerformed: event.actionPerformed,
      actionType: event.actionType || 'DATA_CHANGE',
      performedByUserId: event.performedByUserId || event.userId || 'admin',
      performedByRole: event.performedByRole || event.userRole || 'SUPER_ADMIN',
      userId: event.userId || event.performedByUserId,
      userRole: event.userRole || event.performedByRole,
      previousValue: event.previousValue || null,
      newValue: event.newValue || null,
      statusChange: event.statusChange || null,
      remarks: event.remarks || null,
      path: event.path || (event.hospitalId ? `/hospital/${event.hospitalId}` : '/profiles/doctors'),
      method: event.method || 'PATCH',
      metadata: event.metadata || {},
    };

    axios
      .post(`${API_GATEWAY}/audit/events/internal`, payload, {
        headers: {
          'x-internal-service-key': INTERNAL_SERVICE_SECRET,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      })
      .catch((err) => {
        console.warn('⚠️ Failed to deliver audit event to Gateway:', err.message);
      });
  } catch (err) {
    console.warn('⚠️ Error in publishAuditEvent:', err.message);
  }
};

module.exports = {
  publishAuditEvent,
  extractActor,
};
