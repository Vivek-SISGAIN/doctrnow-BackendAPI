const doctorService = require('../service/doctor.service');
const specialtyService = require('../service/specialty.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const getAllDoctors = asyncHandler(async (req, res) => {
  const { specialty, specialtyId, search, gender, minExperience, maxFee, workingDay } = req.query;

  let specialtyName = specialty;
  if (specialtyId && !specialtyName) {
    const spec = await specialtyService.findById(specialtyId);
    if (spec) {specialtyName = spec.name};
  }

  const filters = {
    specialtyName,
    search,
    gender,
    minExperience,
    maxFee,
    workingDay
  };

  const doctors = await doctorService.findAllWithFilters(filters);

  res.status(200).json({
    success: true,
    data: doctors
  });
});

const getDoctorById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const doctor = await doctorService.findByIdOrUserId(id);

  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  res.status(200).json({
    success: true,
    data: doctor
  });
});

const getDocByHospitalId = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;
  const doctors = await doctorService.findDocByHospital({ hospitalId });;

  res.status(200).json({
    success: true,
    data: doctors
  });
});

const updateDoctor = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { email, mobile, emiratesId, licenseNumber } = req.body;

  const doctor = await doctorService.findById(id);

  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  // Check for conflicts if updating unique fields
  const conflicts = await doctorService.findConflictingDoctor(id, {
    email,
    mobile,
    emiratesId,
    licenseNumber
  });

  if (conflicts) {
    if (conflicts.email === email) {
      throw ApiError.conflict('Email already in use');
    }
    if (conflicts.mobile === mobile) {
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

const getAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await doctorService.getAvailability(id);
  if (!result) {
    throw ApiError.notFound('Doctor not found');
  }
  res.status(200).json({
    success: true,
    data: result
  });
});

const setAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const valid = ['ONLINE', 'OFFLINE', 'BUSY'];
  if (!status || !valid.includes(status)) {
    throw ApiError.badRequest('status must be one of: ONLINE, OFFLINE, BUSY');
  }
  const doctor = await doctorService.setAvailability(id, status);
  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }
  res.status(200).json({
    success: true,
    data: { status: doctor.availabilityStatus }
  });
});

const createDoctor = asyncHandler(async (req, res) => {
  const {
    userId,

    fullName,
    email,
    mobile,
    gender,
    nationality,
    emiratesId,

    primarySpecialization,
    subSpecialization,

    licenseNumber,
    licenseType,
    licenseExpiry,

    yearsOfExperience,
    medicalDegree,
    university,
    profileImage,

    languagesSpoken,
    servicesOffered,
    certifications,
    professionalMemberships,

    professionalBio,

    schedule,   
    hospitalId,
    videoConsultationFee,
    phoneConsultationFee,
    followUpFee,

    hospitalSharePercent,
    platformSharePercent
  } = req.body;

  const doctor = await doctorService.createDoctor({
    userId,
    hospitalId,
    fullName,
    email,
    mobile,
    gender,
    nationality,
    emiratesId,

    primarySpecialization,
    subSpecialization,

    licenseNumber,
    licenseType,
    licenseExpiry,

    yearsOfExperience,
    medicalDegree,
    university,
    profileImage,

    languagesSpoken,
    servicesOffered,
    certifications,
    professionalMemberships,

    professionalBio,

    schedule,   

    videoConsultationFee,
    phoneConsultationFee,
    followUpFee,

    hospitalSharePercent,
    platformSharePercent
  });

  res.status(201).json({
    success: true,
    message: 'Doctor created successfully',
    data: doctor
  });
});

const getDoctorsByBulkIds = asyncHandler(async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw ApiError.badRequest("ids must be a non-empty array");
  }

  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length > 100) {
    throw ApiError.badRequest("Maximum 100 ids allowed per request");
  }

  const doctors = await doctorService.findByIdsOrUserIds(uniqueIds);

  const doctorMap = {};

  doctors.forEach((doctor) => {
    doctorMap[doctor.id] = doctor;
  });

  res.status(200).json({
    success: true,
    data: doctorMap,
    count: doctors.length,
  });
});

module.exports = {
  getDoctorById,
  updateDoctor,
  createDoctor,
  deleteDoctor,
  getAllDoctors,
  searchDoctorsBySpecialization,
  getAvailability,
  setAvailability,
  getDoctorsByBulkIds,
  getDocByHospitalId
};
