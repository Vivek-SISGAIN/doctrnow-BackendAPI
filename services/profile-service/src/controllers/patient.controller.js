const patientService = require('../service/patient.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

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

  const filters = {
    search,
    gender,
    bloodGroup,
    riskCategory,
    patientType,
    followUpStatus
  };

  const pagination = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10)
  };

  const result = await patientService.findAll(filters, pagination, sortBy);

  res.status(200).json({
    success: true,
    data: result.patients,
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

module.exports = {
  getAllPatients,
  getPatientById,
  updatePatient,
  deletePatient
};
