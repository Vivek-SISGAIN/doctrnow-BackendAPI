const jwt = require('jsonwebtoken');
const prisma = require('../prisma/prisma');
const hospitalAdminService = require('../service/hospitalAdmin.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Canonical list of permission keys supported by the system
const VALID_PERMISSIONS = new Set([
  'consultations',
  'doctors',
  'patients',
  'insurance_providers',
  'insurance_claims',
  'health_services',
  'revenue',
  'payments',
  'conflicts',
  'notifications',
  'reports'
]);

/**
 * Extract and verify calling actor identity, role, hospitalId, and subRole.
 * Prioritizes headers injected by gateway / decoded JWT, then queries database for true hospital/subRole.
 */
const extractActor = async (req) => {
  let userId = req.headers['x-user-id'] || req.user?.id || req.user?.userId;
  let userRole = req.headers['x-user-role'] || req.user?.role;
  let hospitalId = req.headers['x-hospital-id'] || req.headers['x-tenant-id'] || req.user?.hospitalId || req.user?.tenantId;

  if ((!userId || !hospitalId || !userRole) && req.headers.authorization) {
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

  let subRole = null;
  let callerAdmin = null;

  if (userId) {
    callerAdmin = await prisma.hospitalAdmin.findFirst({
      where: {
        OR: [{ userId }, { id: userId }]
      }
    });

    if (callerAdmin) {
      hospitalId = callerAdmin.hospitalId;
      subRole = callerAdmin.subRole || 'ADMIN';
      userRole = userRole || 'HOSPITAL_ADMIN';
    }
  }

  return {
    userId: userId || 'anonymous',
    userRole: userRole || 'USER',
    hospitalId: hospitalId || null,
    subRole: subRole || (userRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'ADMIN'),
    callerAdmin
  };
};

const getHospitalAdminById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const actor = await extractActor(req);

  const hospitalAdmin = await hospitalAdminService.findById(id);

  if (!hospitalAdmin) {
    throw ApiError.notFound('Hospital admin not found');
  }

  // Cross-hospital access guard: Hospital Admins can only view admins belonging to their hospital
  if (actor.userRole === 'HOSPITAL_ADMIN' && actor.hospitalId && hospitalAdmin.hospitalId !== actor.hospitalId) {
    throw ApiError.forbidden('Cannot view admin from another hospital');
  }

  res.status(200).json({
    success: true,
    data: hospitalAdmin
  });
});

const getHospitalAdminsByHospital = asyncHandler(async (req, res) => {
  const { hospitalName, hospitalId } = req.params;
  const actor = await extractActor(req);

  // Multi-tenant check: ensure hospital admin only queries their own hospital
  if (actor.userRole === 'HOSPITAL_ADMIN' && actor.hospitalId) {
    if (hospitalId && hospitalId !== actor.hospitalId) {
      throw ApiError.forbidden('Cannot view admins from another hospital');
    }
    if (hospitalName && actor.callerAdmin && actor.callerAdmin.hospitalName.toLowerCase() !== hospitalName.toLowerCase()) {
      throw ApiError.forbidden('Cannot view admins from another hospital');
    }
  }

  const queryHospitalId = hospitalId || actor.hospitalId;
  const hospitalAdmins = queryHospitalId
    ? await hospitalAdminService.findByHospitalId(queryHospitalId)
    : await hospitalAdminService.findByHospitalName(hospitalName);

  res.status(200).json({
    success: true,
    data: hospitalAdmins
  });
});

const createHospitalAdmin = asyncHandler(async (req, res) => {
  const actor = await extractActor(req);

  // Authorization check: Only MASTER_ADMIN or SUPER_ADMIN may create new admins
  if (actor.userRole !== 'SUPER_ADMIN' && actor.subRole !== 'MASTER_ADMIN') {
    throw ApiError.forbidden('Only Master Admins can create sub-accounts');
  }

  const {
    userId,
    fullName,
    email,
    phoneNumber,
    gender,
    nationality,
    emiratesId,
    hospitalName,
    profileImage,
    hospitalId,
    position,
    department,
    tenantId,
    subRole = 'ADMIN',
    permissions = []
  } = req.body;

  // Never trust client-supplied hospitalId — enforce caller's own hospitalId
  const effectiveHospitalId = actor.userRole === 'SUPER_ADMIN' ? (hospitalId || tenantId) : actor.hospitalId;
  const effectiveHospitalName = actor.callerAdmin ? actor.callerAdmin.hospitalName : hospitalName;

  if (!effectiveHospitalId) {
    throw ApiError.badRequest('Hospital ID is required');
  }

  // Validate permissions
  let sanitizedPermissions = [];
  if (subRole === 'ADMIN' && Array.isArray(permissions)) {
    for (const key of permissions) {
      if (!VALID_PERMISSIONS.has(key)) {
        throw ApiError.badRequest(`Invalid permission key: ${key}`);
      }
    }
    sanitizedPermissions = permissions;
  }

  const hospitalAdmin = await hospitalAdminService.createHospitalAdmin({
    userId,
    fullName,
    email,
    phoneNumber,
    gender,
    nationality,
    emiratesId,
    hospitalName: effectiveHospitalName,
    profileImage,
    hospitalId: effectiveHospitalId,
    position,
    department,
    tenantId: effectiveHospitalId,
    subRole,
    permissions: sanitizedPermissions
  });

  res.status(201).json({
    success: true,
    message: 'Hospital admin created successfully',
    data: hospitalAdmin
  });
});

const getAllHospitalAdmins = asyncHandler(async (req, res) => {
  const actor = await extractActor(req);

  // Gated for SUPER_ADMIN only; hospital admins cannot list all system admins
  if (actor.userRole !== 'SUPER_ADMIN') {
    throw ApiError.forbidden('Not authorized to list all hospital admins');
  }

  const { search, gender, page = 1, limit = 20 } = req.query;

  const filters = { search, gender };
  const pagination = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10)
  };

  const result = await hospitalAdminService.findAll(filters, pagination);

  res.status(200).json({
    success: true,
    data: result.data,
    pagination: result.pagination
  });
});

const updateHospitalAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const actor = await extractActor(req);

  const targetAdmin = await hospitalAdminService.findById(id);

  if (!targetAdmin) {
    throw ApiError.notFound('Hospital admin not found');
  }

  // Hospital tenant boundary check
  if (actor.userRole === 'HOSPITAL_ADMIN' && actor.hospitalId && targetAdmin.hospitalId !== actor.hospitalId) {
    throw ApiError.forbidden('Cannot edit an admin from another hospital');
  }

  const isSelf = targetAdmin.userId === actor.userId || targetAdmin.id === actor.userId;

  // If updating a different admin, caller MUST be a MASTER_ADMIN
  if (!isSelf && actor.userRole !== 'SUPER_ADMIN' && actor.subRole !== 'MASTER_ADMIN') {
    throw ApiError.forbidden('Only Master Admins can manage other admins');
  }

  // Clone update data
  const updateData = { ...req.body };

  // Block privilege escalation: plain ADMIN cannot modify subRole, permissions, or hospitalId
  if (actor.userRole !== 'SUPER_ADMIN' && actor.subRole !== 'MASTER_ADMIN') {
    delete updateData.subRole;
    delete updateData.permissions;
    delete updateData.hospitalId;
    delete updateData.tenantId;
  }

  // If permissions are being updated, validate every key against whitelist
  if (updateData.permissions !== undefined) {
    if (!Array.isArray(updateData.permissions)) {
      throw ApiError.badRequest('Permissions must be an array of strings');
    }
    for (const key of updateData.permissions) {
      if (!VALID_PERMISSIONS.has(key)) {
        throw ApiError.badRequest(`Invalid permission key: ${key}`);
      }
    }
  }

  // Never allow changing hospitalId via update
  delete updateData.hospitalId;
  delete updateData.tenantId;

  const updatedHospitalAdmin = await hospitalAdminService.update(id, updateData);

  res.status(200).json({
    success: true,
    message: 'Hospital admin updated successfully',
    data: updatedHospitalAdmin
  });
});

const deleteHospitalAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const actor = await extractActor(req);

  const targetAdmin = await hospitalAdminService.findById(id);

  if (!targetAdmin) {
    throw ApiError.notFound('Hospital admin not found');
  }

  // Hospital tenant boundary check
  if (actor.userRole === 'HOSPITAL_ADMIN' && actor.hospitalId && targetAdmin.hospitalId !== actor.hospitalId) {
    throw ApiError.forbidden('Cannot delete an admin from another hospital');
  }

  // Only Master Admins can delete sub-accounts
  if (actor.userRole !== 'SUPER_ADMIN' && actor.subRole !== 'MASTER_ADMIN') {
    throw ApiError.forbidden('Only Master Admins can delete sub-accounts');
  }

  // Prevent self-deletion
  if (targetAdmin.userId === actor.userId || targetAdmin.id === actor.userId) {
    throw ApiError.badRequest('Cannot delete your own administrator account');
  }

  await hospitalAdminService.delete(id);

  res.status(200).json({
    success: true,
    message: 'Hospital admin deleted successfully'
  });
});

module.exports = {
  getHospitalAdminById,
  getHospitalAdminsByHospital,
  updateHospitalAdmin,
  deleteHospitalAdmin,
  createHospitalAdmin,
  getAllHospitalAdmins
};
