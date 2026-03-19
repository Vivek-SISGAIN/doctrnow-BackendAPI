const superAdminService = require('../service/superAdmin.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const getSuperAdminById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const superAdmin = await superAdminService.findById(id);

  if (!superAdmin) {
    throw ApiError.notFound('Super admin not found');
  }

  res.status(200).json({
    success: true,
    data: superAdmin
  });
});

const updateSuperAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { email, phoneNumber, emiratesId } = req.body;

  const superAdmin = await superAdminService.findById(id);

  if (!superAdmin) {
    throw ApiError.notFound('Super admin not found');
  }

  // Check for conflicts if updating unique fields
  const conflicts = await superAdminService.findConflictingAdmin(id, {
    email,
    phoneNumber,
    emiratesId
  });

  if (conflicts) {
    if (conflicts.email === email) {
      throw ApiError.conflict('Email already in use');
    }
    if (conflicts.phoneNumber === phoneNumber) {
      throw ApiError.conflict('Phone number already in use');
    }
    if (conflicts.emiratesId === emiratesId) {
      throw ApiError.conflict('Emirates ID already in use');
    }
  }

  const updatedSuperAdmin = await superAdminService.update(id, req.body);

  res.status(200).json({
    success: true,
    message: 'Super admin updated successfully',
    data: updatedSuperAdmin
  });
});

const deleteSuperAdmin = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const superAdmin = await superAdminService.findById(id);

  if (!superAdmin) {
    throw ApiError.notFound('Super admin not found');
  }

  // Prevent deleting the last super admin
  const superAdminCount = await superAdminService.count();
  if (superAdminCount <= 1) {
    throw ApiError.badRequest('Cannot delete the last super admin');
  }

  await superAdminService.delete(id);

  res.status(200).json({
    success: true,
    message: 'Super admin deleted successfully'
  });
});

const createSuperAdmin = asyncHandler(async (req, res) => {
  const { fullName, email, phoneNumber, gender, nationality, emiratesId, profileImage, password } = req.body;

  // Basic required field checks
  if (!fullName || !email || !phoneNumber || !gender || !nationality || !emiratesId || !password) {
    throw ApiError.badRequest('All fields (fullName, email, phoneNumber, gender, nationality, emiratesId, password) are required');
  }

  if (password.length < 6) {
    throw ApiError.badRequest('Password must be at least 6 characters');
  }

  // Check uniqueness conflicts
  const existing = await superAdminService.findByUniqueFields({ email, phoneNumber, emiratesId });
  if (existing) {
    if (existing.email === email) throw ApiError.conflict('Email already in use');
    if (existing.phoneNumber === phoneNumber) throw ApiError.conflict('Phone number already in use');
    if (existing.emiratesId === emiratesId) throw ApiError.conflict('Emirates ID already in use');
  }

  const superAdmin = await superAdminService.createSuperAdmin({
    fullName, email, phoneNumber, gender, nationality, emiratesId, profileImage, password
  });

  res.status(201).json({
    success: true,
    message: 'Super admin created successfully',
    data: superAdmin
  });
});

module.exports = {
  getSuperAdminById,
  updateSuperAdmin,
  deleteSuperAdmin,
  createSuperAdmin
};
