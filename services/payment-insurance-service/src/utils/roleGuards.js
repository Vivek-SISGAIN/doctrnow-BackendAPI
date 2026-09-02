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
};
