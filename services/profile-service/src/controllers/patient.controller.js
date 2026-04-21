const patientService = require('../service/patient.service');
const familyMemberService = require('../service/familyMember.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const axios = require('axios');

const getAllPatients = asyncHandler(async (req, res) => {
  const {
    search,
    gender,
    bloodGroup,
    riskCategory,
    patientType,
    followUpStatus,
    page = 1,
    limit = 20,
    sortBy = 'recent'
  } = req.query;

  const result = await patientService.findAll(
    { search, gender, bloodGroup, riskCategory, patientType, followUpStatus },
    { page: parseInt(page, 10), limit: parseInt(limit, 10) },
    sortBy
  );


  // Merge status into each patient
  const patients = result.patients.map((p) => ({
    ...p
  }));

  res.status(200).json({
    success: true,
    data: patients,
    pagination: {
      page: result.pagination.page,
      limit: result.pagination.limit,
      total: result.pagination.total,
      totalPages: result.pagination.totalPages
    }
  });
});

const getPatientById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const patient = await patientService.findById(id);

  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }

  res.status(200).json({
    success: true,
    data: patient
  });
});

/**
 * Get current patient profile by userId (from X-User-ID set by gateway)
 */
const getCurrentPatient = asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    throw ApiError.unauthorized('User ID required');
  }

  const patient = await patientService.findByUserId(userId);
  if (!patient) {
    throw ApiError.notFound('Patient profile not found');
  }

  res.status(200).json({
    success: true,
    data: patient
  });
});

/**
 * Create patient profile for current user (POST /api/patients/me).
 * Used after registration when user completes profile-setup.
 * Requires X-User-ID from gateway.
 */
const createCurrentPatient = asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    throw ApiError.unauthorized('User ID required');
  }

  const conflict = await patientService.findByUniqueFields({
    email: req.body.email,
    mobileNumber: req.body.mobileNumber,
    emiratesId: req.body.emiratesId
  });
  if (conflict) {
    if (conflict.email === req.body.email) {
      throw ApiError.conflict('Email already in use');
    }
    if (conflict.mobileNumber === req.body.mobileNumber) {
      throw ApiError.conflict('Mobile number already in use');
    }
    if (conflict.emiratesId === req.body.emiratesId) {
      throw ApiError.conflict('Emirates ID already in use');
    }
  }

  const familyConflict = await familyMemberService.findByEmiratesId(req.body.emiratesId);
  if (familyConflict) {
    throw ApiError.conflict('Emirates ID already in use');
  }

  const patient = await patientService.createForUser(userId, req.body);
  res.status(201).json({
    success: true,
    message: 'Patient profile created successfully',
    data: patient
  });
});

const updatePatient = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { mobileNumber, email, emiratesId } = req.body;

  const patient = await patientService.findById(id);

  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }

  // Check for conflicts if updating unique fields
  const conflicts = await patientService.findConflictingPatient(id, {
    mobileNumber,
    email,
    emiratesId
  });

  if (conflicts) {
    if (conflicts.mobileNumber === mobileNumber) {
      throw ApiError.conflict('Mobile number already in use');
    }
    if (conflicts.email === email) {
      throw ApiError.conflict('Email already in use');
    }
    if (conflicts.emiratesId === emiratesId) {
      throw ApiError.conflict('Emirates ID already in use');
    }
  }

  if (emiratesId) {
    const familyConflict = await familyMemberService.findByEmiratesId(emiratesId);
    if (familyConflict) {
      throw ApiError.conflict('Emirates ID already in use');
    }
  }

  const updatedPatient = await patientService.update(id, req.body);

  res.status(200).json({
    success: true,
    message: 'Patient updated successfully',
    data: updatedPatient
  });
});

const deletePatient = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const patient = await patientService.findById(id);

  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }

  await patientService.delete(id);

  res.status(200).json({
    success: true,
    message: 'Patient deleted successfully'
  });
});

const getPatientsByBulkIds = asyncHandler(async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw ApiError.badRequest('ids must be a non-empty array');
  }

  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length > 100) {
    throw ApiError.badRequest('Maximum 100 ids allowed per request');
  }

  const patients = await patientService.findByIds(uniqueIds);

  const patientMap = {};
  patients.forEach((patient) => {
    patientMap[patient.id] = patient;
  });

  res.status(200).json({
    success: true,
    data: patientMap,
    count: patients.length
  });
});

const updatePatientStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const patient = await patientService.findById(id);

  if (!patient) {
    throw ApiError.notFound('Patient not found');
  }

  await axios.patch(`${process.env.API_BASE_URL}/auth/users/${patient.userId}/status`, {
    status
  }).catch((err) => {
    console.error('Failed to update user status in auth service:', err?.response?.data || err.message);
    throw ApiError.internal('Failed to update user status');
  });

  const updatedPatient = await patientService.update(id, { status });

  res.status(200).json({
    success: true,
    message: 'Patient status updated successfully',
    data: updatedPatient
  });
});

module.exports = {
  getAllPatients,
  getPatientById,
  getCurrentPatient,
  createCurrentPatient,
  updatePatient,
  deletePatient,
  updatePatientStatus,
  getPatientsByBulkIds
};
