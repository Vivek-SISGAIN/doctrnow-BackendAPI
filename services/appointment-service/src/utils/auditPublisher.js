const axios = require('axios');

const API_GATEWAY = (process.env.BASE_URL || process.env.API_BASE_URL || 'http://localhost:8080/api/v1').replace(/\/+$/, '');
const INTERNAL_SERVICE_SECRET =
  process.env.INTERNAL_SERVICE_SECRET ||
  process.env.INTERNAL_SECRET ||
  'super_secret_internal_key_123';

const decodeJwtUnsafe = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const raw = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const extractActor = (req) => {
  let userId = req.headers['x-user-id'] || req.user?.id || req.user?.userId;
  let userRole = req.headers['x-user-role'] || req.user?.role;
  let hospitalId = req.headers['x-hospital-id'] || req.headers['x-tenant-id'] || req.user?.hospitalId || req.user?.tenantId;

  if ((!userId || !hospitalId) && req.headers.authorization) {
    try {
      const token = req.headers.authorization.replace(/^Bearer\s+/i, '');
      const decoded = decodeJwtUnsafe(token);
      if (decoded) {
        userId = userId || decoded.userId || decoded.id || decoded.sub;
        userRole = userRole || decoded.role;
        hospitalId = hospitalId || decoded.hospitalId || decoded.tenantId;
      }
    } catch {}
  }
  return {
    userId: userId || 'admin',
    userRole: userRole || 'HOSPITAL_ADMIN',
    hospitalId: hospitalId || null,
  };
};

const publishAuditEvent = async (event) => {
  try {
    const payload = {
      timestamp: new Date().toISOString(),
      service: 'appointment-service',
      hospitalId: event.hospitalId,
      entityType: event.entityType || 'APPOINTMENT',
      actionPerformed: event.actionPerformed,
      actionType: event.actionType || 'DATA_CHANGE',
      performedByUserId: event.performedByUserId || event.userId || 'admin',
      performedByRole: event.performedByRole || event.userRole || 'HOSPITAL_ADMIN',
      userId: event.userId || event.performedByUserId,
      userRole: event.userRole || event.performedByRole,
      previousValue: event.previousValue || null,
      newValue: event.newValue || null,
      statusChange: event.statusChange || null,
      remarks: event.remarks || null,
      path: event.path || (event.hospitalId ? `/hospital/${event.hospitalId}` : '/appointments'),
      method: event.method || 'POST',
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
        console.warn('⚠️ Failed to deliver appointment audit event to Gateway:', err.message);
      });
  } catch (err) {
    console.warn('⚠️ Error in publishAuditEvent:', err.message);
  }
};

module.exports = {
  publishAuditEvent,
  extractActor,
};
