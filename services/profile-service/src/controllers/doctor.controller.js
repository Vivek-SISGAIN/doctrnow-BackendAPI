const doctorService = require('../service/doctor.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');


const getDoctorById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const doctor = await doctorService.findById(id);

  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  res.status(200).json({
    success: true,
    data: doctor
  });
});

const updateDoctor = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { email, phoneNumber, emiratesId, licenseNumber } = req.body;

  const doctor = await doctorService.findById(id);

  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  // Check for conflicts if updating unique fields
  const conflicts = await doctorService.findConflictingDoctor(id, {
    email,
    phoneNumber,
    emiratesId,
    licenseNumber
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
    if (conflicts.licenseNumber === licenseNumber) {
      throw ApiError.conflict('License number already in use');
    }
  }

  const updatedDoctor = await doctorService.update(id, req.body);

  res.status(200).json({
    success: true,
    message: 'Doctor updated successfully',
    data: updatedDoctor
  });
});

const deleteDoctor = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const doctor = await doctorService.findById(id);

  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  await doctorService.delete(id);

  res.status(200).json({
    success: true,
    message: 'Doctor deleted successfully'
  });
});

const searchDoctorsBySpecialization = asyncHandler(async (req, res) => {
  const { query } = req.query;

  if (!query) {
    throw ApiError.badRequest('Search query is required');
  }

  const doctors = await doctorService.searchBySpecialization(query);

  res.status(200).json({
    success: true,
    data: doctors
  });
});

module.exports = {
  getDoctorById,
  updateDoctor,
  deleteDoctor,
  searchDoctorsBySpecialization
};
