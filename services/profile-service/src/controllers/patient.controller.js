const patientService = require('../service/patient.service');
const doctorService = require('../service/doctor.service');
const familyMemberService = require('../service/familyMember.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { publishAuditEvent, extractActor } = require('../utils/auditPublisher');
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
    sortBy = 'recent',
    doctorId
  } = req.query;

  let effectiveDoctorId = doctorId;
  const userRole = req.headers['x-user-role'];
  const userId = req.headers['x-user-id'];

  if (userRole === 'DOCTOR' && userId) {
    const doctor = await doctorService.findByIdOrUserId(userId);
    if (doctor) {
      effectiveDoctorId = doctor.id;
    }
  }

  let ids = [];
  if (effectiveDoctorId) {
    try {
      const response = await axios.get(`${process.env.API_BASE_URL}/consultations/doctors/${effectiveDoctorId}/patients`, {
        headers: {
          'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET
        }
      });
      ids = response.data?.data || [];
      if (ids.length === 0) {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { page: parseInt(page, 10), limit: parseInt(limit, 10), total: 0, totalPages: 0 }
        });
      }
    } catch (err) {
      console.error('Failed to fetch patient IDs from consultation service:', err.message);
    }
  }

  const result = await patientService.findAll(
    { search, gender, bloodGroup, riskCategory, patientType, followUpStatus, ids },
    { page: parseInt(page, 10), limit: parseInt(limit, 10) },
    sortBy
  );


  // Merge status into each patient and resolve S3 URLs
  const patients = await Promise.all(result.patients.map(async (p) => {
    const patientObj = { ...p };
    if (patientObj.profileImage) {
      patientObj.profileImage = await getPresignedS3Url(patientObj.profileImage) || patientObj.profileImage;
    }
    return patientObj;
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

  if (patient.profileImage) {
    patient.profileImage = await getPresignedS3Url(patient.profileImage) || patient.profileImage;
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

  if (patient.profileImage) {
    patient.profileImage = await getPresignedS3Url(patient.profileImage) || patient.profileImage;
  }

  const authHeader = req.headers.authorization;
  let appointments = 0;
  let doctorsConsulted = 0;
  let documents = 0;

  if (authHeader) {
    try {
      const [appointmentsRes, doctorsRes, documentsRes] = await Promise.allSettled([
        axios.get(`${process.env.API_BASE_URL}/appointments?patientId=${patient.id}&limit=1`, {
          headers: { Authorization: authHeader }
        }),
        axios.get(`${process.env.API_BASE_URL}/appointments/${patient.id}/previously-consulted-doctors`, {
          headers: { Authorization: authHeader }
        }),
        axios.get(`${process.env.API_BASE_URL}/documents/patient/${patient.id}?limit=1`, {
          headers: { Authorization: authHeader }
        })
      ]);

      if (appointmentsRes.status === 'fulfilled') {
        appointments = appointmentsRes.value.data?.pagination?.total || 0;
      }
      if (doctorsRes.status === 'fulfilled') {
        doctorsConsulted = doctorsRes.value.data?.data?.length || 0;
      }
      if (documentsRes.status === 'fulfilled') {
        documents = documentsRes.value.data?.pagination?.total || 0;
      }
    } catch (error) {
      console.error('Error fetching profile counts:', error.message);
    }
  }

  res.status(200).json({
    success: true,
    data: {
      ...patient,
      profileCount: {
        appointments,
        doctorsConsulted,
        documents
      }
    }
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
  const actor = extractActor(req);
  const hospitalId = actor.hospitalId || req.headers['x-hospital-id'] || req.body.hospitalId || null;

  publishAuditEvent({
    hospitalId,
    entityType: 'PATIENT',
    actionPerformed: 'Patient Created',
    actionType: 'DATA_CHANGE',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    userId: actor.userId,
    userRole: actor.userRole,
    previousValue: null,
    newValue: patient,
    remarks: `Patient ${patient.firstName || ''} ${patient.lastName || ''}`.trim() + ' profile created',
    path: `/profiles/patients/${patient.id}`,
    method: 'POST',
    metadata: {
      patientId: patient.id,
      patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
      email: patient.email,
    },
  });

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

  const { remarks, ...cleanUpdateData } = req.body;
  const updatedPatient = await patientService.update(id, cleanUpdateData);
  const actor = extractActor(req);
  const hospitalId = actor.hospitalId || req.headers['x-hospital-id'] || req.body.hospitalId || null;

  publishAuditEvent({
    hospitalId,
    entityType: 'PATIENT',
    actionPerformed: 'Patient Profile Updated',
    actionType: 'DATA_CHANGE',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    userId: actor.userId,
    userRole: actor.userRole,
    previousValue: patient,
    newValue: updatedPatient,
    remarks: remarks || `Patient ${patient.firstName || ''} ${patient.lastName || ''}`.trim() + ' profile updated',
    path: `/profiles/patients/${id}`,
    method: 'PATCH',
    metadata: {
      patientId: id,
      patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
      email: patient.email,
    },
  });

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
  const actor = extractActor(req);
  const hospitalId = actor.hospitalId || req.headers['x-hospital-id'] || null;

  publishAuditEvent({
    hospitalId,
    entityType: 'PATIENT',
    actionPerformed: 'Patient Deleted',
    actionType: 'WORKFLOW',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    userId: actor.userId,
    userRole: actor.userRole,
    previousValue: patient,
    newValue: null,
    statusChange: patient.status ? { from: patient.status, to: 'DELETED' } : null,
    remarks: req.body?.remarks || `Patient ${patient.firstName || ''} ${patient.lastName || ''}`.trim() + ' deleted',
    path: `/profiles/patients/${id}`,
    method: 'DELETE',
    metadata: {
      patientId: id,
      patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
    },
  });

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

  const patients = await patientService.findByIdsOrUserIds(uniqueIds);

  const patientMap = {};
  for (const patient of patients) {
    const patientObj = { ...patient };
    if (patientObj.profileImage) {
      patientObj.profileImage = await getPresignedS3Url(patientObj.profileImage) || patientObj.profileImage;
    }
    patientMap[patientObj.id] = patientObj;
    if (patientObj.userId) {
      patientMap[patientObj.userId] = patientObj;
    }
  }

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
  const actor = extractActor(req);
  const hospitalId = actor.hospitalId || req.headers['x-hospital-id'] || req.body.hospitalId || null;

  publishAuditEvent({
    hospitalId,
    entityType: 'PATIENT',
    actionPerformed: 'Patient Status Changed',
    actionType: 'WORKFLOW',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    userId: actor.userId,
    userRole: actor.userRole,
    previousValue: { status: patient.status },
    newValue: { status: updatedPatient.status },
    statusChange: { from: patient.status || null, to: status },
    remarks: `Patient status updated from ${patient.status || 'UNSET'} to ${status}`,
    path: `/profiles/patients/${id}/status`,
    method: 'PATCH',
    metadata: {
      patientId: id,
      patientName: `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
    },
  });

  res.status(200).json({
    success: true,
    message: 'Patient status updated successfully',
    data: updatedPatient
  });
});

const { getPresignedUploadUrl, getPresignedS3Url } = require('../utils/s3Handler');

const getAvatarUploadUrl = asyncHandler(async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    throw ApiError.unauthorized('User ID required');
  }

  const { mimeType } = req.query;
  if (!mimeType) {
    throw ApiError.badRequest('mimeType is required');
  }

  // Get patient to ensure they exist and use their ID
  const patient = await patientService.findByUserId(userId);
  if (!patient) {
    throw ApiError.notFound('Patient profile not found');
  }

  const fileExt = mimeType.split('/')[1] || 'jpg';
  const fileKey = `patient-profile/${patient.id}-${Date.now()}.${fileExt}`;

  const { uploadUrl, fileUrl } = await getPresignedUploadUrl(fileKey, mimeType);

  res.status(200).json({
    success: true,
    data: { uploadUrl, fileUrl }
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
  getPatientsByBulkIds,
  getAvatarUploadUrl
};
