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

module.exports = {
  rejectIfNotSuperAdmin,
  resolveReadScope,
};

/**
 * Resolves the caller's data scope for read endpoints that both SUPER_ADMIN
 * and HOSPITAL_ADMIN may call. SUPER_ADMIN sees everything — hospitalId:
 * null means "no filter, platform-wide." HOSPITAL_ADMIN is always scoped to
 * their own hospital, taken from X-Tenant-ID — the same header
 * hospital-admin-service already uses to scope this role everywhere else in
 * the app (see doctor.controller.ts, healthService.controller.ts). This is
 * deliberately never taken from a query param or path segment the caller
 * controls — a HOSPITAL_ADMIN cannot widen their own scope by passing a
 * different hospitalId anywhere in the request.
 *
 * Returns { hospitalId } on success (hospitalId is null for SUPER_ADMIN, or
 * a string for HOSPITAL_ADMIN), or null if rejected (response already sent).
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
