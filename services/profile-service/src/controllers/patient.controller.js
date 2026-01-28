const patientService = require('../service/patient.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

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
  getPatientById,
  updatePatient,
  deletePatient
};
