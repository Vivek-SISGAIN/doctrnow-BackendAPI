'use strict';

/**
 * Role guard — rejects if the gateway-forwarded x-user-role is not SUPER_ADMIN.
 * Returns true if rejected (response already sent), false if caller may proceed.
 */
function rejectIfNotSuperAdmin(req, res) {
  const role = req.headers['x-user-role'];
  if (role !== 'SUPER_ADMIN') {
    res.status(403).json({
      success: false,
      message: `Forbidden: role '${role || '(none)'}' is not authorised for this endpoint. Requires SUPER_ADMIN.`,
    });
    return true;
  }
  return false;
}

/**
 * Resolves caller data scope: SUPER_ADMIN -> { hospitalId: null }, HOSPITAL_ADMIN -> { hospitalId: tenantId }
 */
function resolveReadScope(req, res) {
  const role = req.headers['x-user-role'];

  if (role === 'SUPER_ADMIN') {
    return { hospitalId: null };
  }

  if (role === 'HOSPITAL_ADMIN') {
    const tenantId = req.headers['x-tenant-id'];
    if (!tenantId) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: HOSPITAL_ADMIN request is missing X-Tenant-ID.',
      });
      return null;
    }
    return { hospitalId: tenantId };
  }

  res.status(403).json({
    success: false,
    message: `Forbidden: role '${role || '(none)'}' is not authorised for this endpoint. Requires SUPER_ADMIN or HOSPITAL_ADMIN.`,
  });
  return null;
}

/**
 * Require PATIENT role and extract patientId from x-user-id header.
 * Returns { patientId } or null if rejected.
 */
function requirePatient(req, res) {
  const role = req.headers['x-user-role'];
  const patientId = req.headers['x-user-id'];

  if (role !== 'PATIENT' || !patientId) {
    res.status(403).json({
      success: false,
      message: `Forbidden: role '${role || '(none)'}' is not authorised for this endpoint. Requires authenticated PATIENT.`,
    });
    return null;
  }
  return { patientId };
}

/**
 * Require HOSPITAL_ADMIN role and extract hospitalId from x-tenant-id.
 * Returns { hospitalId } or null if rejected.
 */
function requireHospitalAdmin(req, res) {
  const role = req.headers['x-user-role'];
  const hospitalId = req.headers['x-tenant-id'];

  if (role !== 'HOSPITAL_ADMIN' || !hospitalId) {
    res.status(403).json({
      success: false,
      message: `Forbidden: role '${role || '(none)'}' is not authorised for this endpoint. Requires HOSPITAL_ADMIN with valid X-Tenant-ID.`,
    });
    return null;
  }
  return { hospitalId };
}

/**
 * Require SUPER_ADMIN role.
 * Returns true or null if rejected.
 */
function requireSuperAdmin(req, res) {
  const role = req.headers['x-user-role'];
  if (role !== 'SUPER_ADMIN') {
    res.status(403).json({
      success: false,
      message: `Forbidden: role '${role || '(none)'}' is not authorised for this endpoint. Requires SUPER_ADMIN.`,
    });
    return null;
  }
  return true;
}

/**
 * Standard pagination parameter extractor.
 */
function getPagination(req, defaultLimit = 20, maxLimit = 100) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const requestedLimit = parseInt(req.query.limit, 10) || defaultLimit;
  const limit = Math.min(Math.max(1, requestedLimit), maxLimit);
  const skip = (page - 1) * limit;

  return { page, limit, skip, take: limit };
}

module.exports = {
  rejectIfNotSuperAdmin,
  resolveReadScope,
  requirePatient,
  requireHospitalAdmin,
  requireSuperAdmin,
  getPagination,
};
