const prisma = require('../prisma/prisma');
const doctorService = require('../service/doctor.service');
const specialtyService = require('../service/specialty.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { uploadToS3 } = require('../utils/s3Handler');
const { publishAuditEvent, extractActor } = require('../utils/auditPublisher');

const getAllDoctors = asyncHandler(async (req, res) => {
  const {
    specialty,
    specialtyId,
    search,
    gender,
    facility,
    languages,
    distanceRange,
    maxFee,
    minExperience,
    countries,
    emirate,
    emirates,
    workingDay,
    status,
    availabilityStatus,
    hospitalId,
    startDate,
    endDate,
    fromDate,
    toDate,
    dateField,
    page = 1,
    limit = 20,
    sortBy = 'experience',
    filters: dynamicFilters // New: Accept filters from query or body
  } = { ...req.query, ...req.body }; // Merge query params and body
  let specialtyName = specialty;
  if (specialtyId && !specialtyName) {
    const spec = await specialtyService.findById(specialtyId);
    if (spec) {
      specialtyName = spec.name;
    }
  }

  let filters = {};

  // If dynamic filters are provided (new format)
  if (dynamicFilters) {
    try {
      filters = typeof dynamicFilters === 'string' ? JSON.parse(dynamicFilters) : dynamicFilters;
    } catch (error) {
      throw new Error('Invalid filters format');
    }
  }
  // Otherwise use legacy format (old format)
  else {
    filters = {
      specialtyName,
      search,
      gender,
      facility,
      languages,
      distanceRange,
      maxFee,
      minExperience,
      countries,
      emirate: emirate || emirates,
      workingDay,
      status,
      availabilityStatus,
      hospitalId,
      startDate: startDate || fromDate,
      endDate: endDate || toDate,
      dateField
    };
  }
  const pagination = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10)
  };

  const result = await doctorService.findAllWithFilters(filters, pagination, sortBy);

  res.status(200).json({
    success: true,
    data: result.doctors,
    pagination: result.pagination
  });
});

const getDocByHospitalId = asyncHandler(async (req, res) => {
  const {
    search,
    gender,
    facility,
    languages,
    distanceRange,
    maxFee,
    minExperience,
    countries,
    emirate,
    emirates,
    specialization,
    workingDay,
    status,
    availabilityStatus,
    startDate,
    endDate,
    fromDate,
    toDate,
    dateField,
    page = 1,
    limit = 20,
    sortBy = 'name',
    filters: dynamicFilters
  } = { ...req.query, ...req.body };

  // ── 1. Resolve hospitalId (params takes precedence over filters) ──────────
  let filters = {};

  if (dynamicFilters) {
    try {
      filters = typeof dynamicFilters === 'string' ? JSON.parse(dynamicFilters) : dynamicFilters;
    } catch {
      throw new Error('Invalid filters format');
    }
  } else {
    filters = {
      search,
      gender,
      facility,
      languages,
      distanceRange,
      maxFee,
      minExperience,
      countries,
      emirate: emirate || emirates,
      specialization,
      workingDay,
      status,
      availabilityStatus,
      startDate: startDate || fromDate,
      endDate: endDate || toDate,
      dateField
    };
  }

  // Scenario 1: hospitalId comes from route params  → /hospitals/:hospitalId/doctors
  // Scenario 2: hospitalId comes from filters object → { filters: { hospitalId: '...' } }
  const resolvedHospitalId = req.params.hospitalId ?? filters.hospitalId;

  if (!resolvedHospitalId) {
    return res.status(400).json({
      success: false,
      message: 'hospitalId is required (pass it as a route param or inside filters)'
    });
  }

  // Remove hospitalId from filters to avoid duplication in the service layer
  delete filters.hospitalId;

  // ── 2. Query ──────────────────────────────────────────────────────────────
  const pagination = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10)
  };

  const result = await doctorService.findDocByHospital(
    { hospitalId: resolvedHospitalId },
    filters,
    pagination,
    sortBy
  );

  res.status(200).json({
    success: true,
    data: result.doctors,
    pagination: result.pagination
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

  const { remarks, ...cleanUpdateData } = req.body;
  const updatedDoctor = await doctorService.update(id, cleanUpdateData);
  const actor = extractActor(req);

  const statusChanged = req.body.status && req.body.status !== doctor.status;
  const targetHospitalId =
    (doctor.assignedHospitalIds && doctor.assignedHospitalIds[0]) ||
    doctor.hospitalId ||
    req.body.hospitalId ||
    null;

  publishAuditEvent({
    hospitalId: targetHospitalId,
    entityType: 'DOCTOR',
    actionPerformed: statusChanged ? 'Doctor Status Changed' : 'Doctor Profile Updated',
    actionType: statusChanged ? 'WORKFLOW' : 'DATA_CHANGE',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    userId: actor.userId,
    userRole: actor.userRole,
    previousValue: statusChanged ? { status: doctor.status } : doctor,
    newValue: statusChanged ? { status: updatedDoctor.status } : updatedDoctor,
    statusChange: statusChanged ? { from: doctor.status || null, to: updatedDoctor.status } : null,
    remarks:
      remarks ||
      (statusChanged
        ? `Doctor status changed from ${doctor.status || 'UNSET'} to ${updatedDoctor.status}`
        : `Doctor ${doctor.fullName || id} profile updated`),
    path: `/profiles/doctors/${id}`,
    method: 'PATCH',
    metadata: {
      doctorId: id,
      doctorName: doctor.fullName,
      email: doctor.email
    }
  });

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
  const actor = extractActor(req);

  const targetHospitalId =
    (doctor.assignedHospitalIds && doctor.assignedHospitalIds[0]) || doctor.hospitalId || null;

  publishAuditEvent({
    hospitalId: targetHospitalId,
    entityType: 'DOCTOR',
    actionPerformed: 'Doctor Deleted',
    actionType: 'WORKFLOW',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    userId: actor.userId,
    userRole: actor.userRole,
    previousValue: doctor,
    newValue: null,
    statusChange: { from: doctor.status || null, to: 'DELETED' },
    remarks: req.body?.remarks || `Doctor ${doctor.fullName || id} deleted`,
    path: `/profiles/doctors/${id}`,
    method: 'DELETE',
    metadata: {
      doctorId: id,
      doctorName: doctor.fullName
    }
  });

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
  const { status, remarks } = req.body;
  const valid = ['ONLINE', 'OFFLINE', 'BUSY'];
  if (!status || !valid.includes(status)) {
    throw ApiError.badRequest('status must be one of: ONLINE, OFFLINE, BUSY');
  }
  const doctor = await doctorService.setAvailability(id, status);
  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }
  const actor = extractActor(req);

  publishAuditEvent({
    hospitalId:
      (doctor.assignedHospitalIds && doctor.assignedHospitalIds[0]) || doctor.hospitalId || null,
    entityType: 'DOCTOR',
    actionPerformed: 'Doctor Availability Changed',
    actionType: 'WORKFLOW',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    userId: actor.userId,
    userRole: actor.userRole,
    previousValue: { availabilityStatus: doctor.availabilityStatus },
    newValue: { availabilityStatus: status },
    statusChange: { from: doctor.availabilityStatus || null, to: status },
    remarks: remarks || `Doctor availability set to ${status}`,
    path: `/profiles/doctors/${id}/availability`,
    method: 'PATCH',
    metadata: {
      doctorId: id,
      doctorName: doctor.fullName
    }
  });

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

  const actor = extractActor(req);
  const targetHospitalId =
    (doctor.assignedHospitalIds && doctor.assignedHospitalIds[0]) ||
    doctor.hospitalId ||
    hospitalId ||
    null;

  publishAuditEvent({
    hospitalId: targetHospitalId,
    entityType: 'DOCTOR',
    actionPerformed: 'Doctor Created',
    actionType: 'WORKFLOW',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    userId: actor.userId,
    userRole: actor.userRole,
    previousValue: null,
    newValue: doctor,
    statusChange: { from: null, to: doctor.status || 'ACTIVE' },
    remarks: `Doctor ${doctor.fullName || doctor.id} profile created`,
    path: `/profiles/doctors`,
    method: 'POST',
    metadata: {
      doctorId: doctor.id,
      doctorName: doctor.fullName
    }
  });

  res.status(201).json({
    success: true,
    message: 'Doctor created successfully',
    data: doctor
  });
});

const checkExists = asyncHandler(async (req, res) => {
  const { email, mobile, emiratesId, licenseNumber } = req.body;
  const result = await doctorService.checkDoctorExists({
    email,
    mobile,
    emiratesId,
    licenseNumber
  });
  res.status(200).json({
    success: true,
    data: result
  });
});

const getDoctorsByBulkIds = asyncHandler(async (req, res) => {
  const { ids, search } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw ApiError.badRequest('ids must be a non-empty array');
  }

  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length > 100) {
    throw ApiError.badRequest('Maximum 100 ids allowed per request');
  }

  const doctors = await doctorService.findByIdsOrUserIds(uniqueIds, search);

  const doctorMap = {};

  doctors.forEach((doctor) => {
    doctorMap[doctor.id] = doctor;
    if (doctor.userId) {
      doctorMap[doctor.userId] = doctor;
    }
  });

  res.status(200).json({
    success: true,
    data: doctorMap,
    count: doctors.length
  });
});

const assignDoctorToHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { hospitalId } = req.body;

  if (!hospitalId) {
    throw ApiError.badRequest('hospitalId is required');
  }

  const doctor = await doctorService.findById(id);
  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  const updatedDoctor = await prisma.doctor.update({
    where: { id },
    data: {
      assignedHospitalIds: {
        push: hospitalId
      }
    }
  });

  const actor = extractActor(req);

  publishAuditEvent({
    hospitalId,
    entityType: 'DOCTOR',
    actionPerformed: 'Doctor Assigned',
    actionType: 'DATA_CHANGE',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    previousValue: null,
    newValue: { doctorId: id, doctorName: doctor.fullName },
    remarks: `Doctor ${doctor.fullName || id} assigned to hospital`,
    path: `/profiles/doctors/${id}/assign-hospital`,
    method: 'PATCH'
  });

  res.status(200).json({
    success: true,
    message: 'Doctor assigned to hospital successfully',
    data: updatedDoctor
  });
});

const removeDoctorFromHospital = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { hospitalId } = req.body;

  if (!hospitalId) {
    throw ApiError.badRequest('hospitalId is required');
  }

  const doctor = await doctorService.findById(id);
  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  const currentAssigned = doctor.assignedHospitalIds || [];
  const updatedAssigned = currentAssigned.filter((hId) => hId !== hospitalId);

  const updatedDoctor = await prisma.doctor.update({
    where: { id },
    data: {
      assignedHospitalIds: {
        set: updatedAssigned
      }
    }
  });

  const actor = extractActor(req);

  publishAuditEvent({
    hospitalId,
    entityType: 'DOCTOR',
    actionPerformed: 'Doctor Removed',
    actionType: 'DATA_CHANGE',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    previousValue: { doctorId: id, doctorName: doctor.fullName },
    newValue: null,
    remarks: `Doctor ${doctor.fullName || id} removed from hospital`,
    path: `/profiles/doctors/${id}/remove-hospital`,
    method: 'PATCH'
  });

  res.status(200).json({
    success: true,
    message: 'Doctor removed from hospital successfully',
    data: updatedDoctor
  });
});

const updateDoctorProfileImage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    throw ApiError.badRequest('No profile image provided');
  }

  const doctor = await doctorService.findByIdOrUserId(id);
  if (!doctor) {
    throw ApiError.notFound('Doctor not found');
  }

  try {
    const { key } = await uploadToS3(req.file, 'doctor-profiles');
    const updatedDoctor = await doctorService.update(doctor.id, { profileImage: key });

    res.status(200).json({
      success: true,
      message: 'Profile image updated successfully',
      data: updatedDoctor
    });
  } catch (error) {
    console.error('[DoctorController] updateDoctorProfileImage error:', error.message);
    throw ApiError.internal('Failed to upload profile image');
  }
});

module.exports = {
  getDoctorById,
  updateDoctor,
  createDoctor,
  checkExists,
  deleteDoctor,
  getAllDoctors,
  searchDoctorsBySpecialization,
  getAvailability,
  setAvailability,
  getDoctorsByBulkIds,
  getDocByHospitalId,
  assignDoctorToHospital,
  removeDoctorFromHospital,
  updateDoctorProfileImage
};
