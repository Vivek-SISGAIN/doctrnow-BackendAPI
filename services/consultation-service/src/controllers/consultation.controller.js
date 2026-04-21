const consultationService = require('../service/consultation.service');
const prisma = require('../prisma/prisma');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { emitToRoom, emitToDoctorRoom, CONSULTATION_EVENTS } = require('../utils/socket');
const chatClient = require('../utils/chat-client');
const profileClient = require('../utils/profile-client');
const appointmentClient = require('../utils/appointment-client');

const baseUrl = process.env.BASE_URL;

async function fetchBulk(ids, bulkUrl, authHeader, entityName) {
  if (ids.length === 0) return {};

  try {
    const response = await fetch(bulkUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader
      },
      body: JSON.stringify({ ids })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data?.data || {};
  } catch (err) {
    console.error(
      `[consultation] Bulk ${entityName} fetch failed:`,
      err.message
    );
    return {};
  }
}

const buildChatSessionPayload = async (consultation, patientId, doctorId) => {
  const [patientProfile, appointment] = await Promise.all([
    profileClient.getPatientProfile(consultation.patientId),
    appointmentClient.getAppointmentById(consultation.appointmentId)
  ]);

  const patientName = [patientProfile?.firstName, patientProfile?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    consultationId: consultation.id,
    patientId,
    doctorId,
    patientName: patientName || null,
    patientAvatar: patientProfile?.profileImage ?? null,
    appointmentId: consultation.appointmentId ?? null,
    appointmentDate: appointment?.slot?.startTime ?? null,
    appointmentType: appointment?.consultationType ?? consultation.type ?? null
  };
};


const createConsultation = asyncHandler(async (req, res) => {
  try {
    const consultation = await consultationService.create(req.body);
    if (consultation?.doctorId) {
      emitToDoctorRoom(consultation.doctorId, CONSULTATION_EVENTS.APPOINTMENT_BOOKED, {
        appointmentId: consultation.appointmentId,
        consultationId: consultation.id,
        doctorId: consultation.doctorId,
        patientId: consultation.patientId,
        hospitalId: consultation.hospitalId ?? null,
      });
    }
    res.status(201).json({
      success: true,
      message: 'Consultation created successfully',
      data: consultation
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const getConsultationById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const consultation = await consultationService.findById(id);

  if (!consultation) {
    throw ApiError.notFound('Consultation not found');
  }

  // Augment with prescription
  const authHeader = req.headers.authorization;
  if (consultation.appointmentId && authHeader) {
    const prescriptionMap = await fetchBulk([consultation.appointmentId], `${baseUrl}prescriptions/appointments/bulk`, authHeader, 'prescription');
    consultation.prescription = prescriptionMap[consultation.appointmentId] || null;
  }

  res.status(200).json({
    success: true,
    data: consultation
  });
});

const getConsultationByAppointment = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const consultation = await consultationService.findByAppointmentId(appointmentId);

  // No consultation yet = patient has not joined the lobby; return 200 with null so UI can show "Patient not in lobby" instead of an error
  
  if (consultation && consultation.appointmentId) {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const prescriptionMap = await fetchBulk([consultation.appointmentId], `${baseUrl}prescriptions/appointments/bulk`, authHeader, 'prescription');
      consultation.prescription = prescriptionMap[consultation.appointmentId] || null;
    }
  }

  res.status(200).json({
    success: true,
    data: consultation || null
  });
});

const joinLobby = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const { patientId, doctorId, hospitalId } = req.body;

  let { consultation, channelName } = await consultationService.joinLobby(appointmentId, patientId, doctorId);
  if (hospitalId && consultation?.id && consultation.hospitalId !== hospitalId) {
    consultation = await consultationService.update(consultation.id, { hospitalId });
  }

  const jwtUserId = req.headers['x-user-id'];
  const jwtRole = req.headers['x-user-role'];

  // ✅ ADD HERE — before any update, shows what we have on lobby join
  console.log('[LOBBY DEBUG] Before update:', {
    patientAuthId: consultation.patientAuthId,
    patientId: consultation.patientId,
    doctorAuthId: consultation.doctorAuthId,  // should be NULL
    doctorId: consultation.doctorId,
    jwtUserId,
    jwtRole
  });

  if (consultation?.id) {
    if (jwtRole === 'PATIENT' && jwtUserId) {
      await consultationService.update(consultation.id, { patientAuthId: jwtUserId });
      consultation.patientAuthId = jwtUserId;
    }

    // ✅ ADD HERE — after update, shows final state leaving joinLobby
    console.log('[LOBBY DEBUG] After update:', {
      patientAuthId: consultation.patientAuthId,
      patientId: consultation.patientId,
      doctorAuthId: consultation.doctorAuthId,  // must still be NULL
      doctorId: consultation.doctorId,
    });
  }

  if (doctorId) {
    emitToDoctorRoom(doctorId, CONSULTATION_EVENTS.PATIENT_JOINED_LOBBY, { appointmentId, consultationId: consultation?.id });
  } else {
    emitToRoom(appointmentId, CONSULTATION_EVENTS.PATIENT_JOINED_LOBBY, { appointmentId, consultationId: consultation?.id });
  }

  res.status(200).json({
    success: true,
    message: 'Joined lobby',
    data: { ...consultation, channelName }
  });
});

const startConsultation = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;

  try {
    const consultation = await consultationService.start(appointmentId);

    const jwtUserId = req.headers['x-user-id'];
    const jwtRole = req.headers['x-user-role'];

    if (consultation?.id) {
      // Save the Clerk userId into the consultation record (Doctor is starting the call)
      if (jwtRole === 'DOCTOR' && jwtUserId && consultation.doctorAuthId !== jwtUserId) {
        await consultationService.update(consultation.id, { doctorAuthId: jwtUserId });
        consultation.doctorAuthId = jwtUserId;
      }

      // ✅ Both authIds are now available — safe to create and start the chat session.
      const chatPatientId = consultation.patientAuthId || consultation.patientId;
      const chatDoctorId = consultation.doctorAuthId || consultation.doctorId;

      const chatSessionPayload = await buildChatSessionPayload(consultation, chatPatientId, chatDoctorId);
      // ✅ ADD HERE — right before createSession call
      console.log('[START DEBUG] Creating session with:', {
        patientAuthId: consultation.patientAuthId,
        patientId: consultation.patientId,
        doctorAuthId: consultation.doctorAuthId,  // should be Clerk ID, NOT null
        doctorId: consultation.doctorId,
        chatPatientId,
        chatDoctorId,  // this is what goes into MongoDB as doctor participant
        jwtUserId,
        jwtRole
      });

      await chatClient.createSession(chatSessionPayload);
      await chatClient.startSession(consultation.id);
    }

    res.status(200).json({ success: true, message: 'Consultation started', data: consultation });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const requestConsent = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;

  const consultation = await consultationService.requestConsent(appointmentId);

  emitToRoom(appointmentId, CONSULTATION_EVENTS.CONSENT_REQUESTED, { appointmentId, consultationId: consultation?.id });

  res.status(200).json({
    success: true,
    message: 'Consent requested',
    data: consultation
  });
});

const acceptConsent = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;

  const consultation = await consultationService.acceptConsent(appointmentId);

  emitToRoom(appointmentId, CONSULTATION_EVENTS.CONSENT_ACCEPTED, { appointmentId, consultationId: consultation?.id });

  res.status(200).json({
    success: true,
    message: 'Consent accepted',
    data: consultation
  });
});


const endConsultation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const consultation = await consultationService.end(id);

    // End chat session
    if (consultation?.id) {
      chatClient.endSession(consultation.id);
    }

    res.status(200).json({
      success: true,
      message: 'Consultation ended',
      data: consultation
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const endByAppointment = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const { endedBy, reason } = req.body || {};
  const who = endedBy === 'patient' ? 'patient' : 'doctor';

  try {
    const { consultation } = await consultationService.endByAppointment(appointmentId, who);

    // End chat session
    if (consultation?.id) {
      chatClient.endSession(consultation.id);
    }

    emitToRoom(appointmentId, CONSULTATION_EVENTS.CALL_ENDED, { appointmentId, consultationId: consultation?.id, endedBy: who, reason });

    res.status(200).json({
      success: true,
      message: 'Consultation ended',
      data: consultation
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const getHistoryByPatient = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const { status, page, limit } = req.query;

  const result = await consultationService.getHistoryByPatientId(patientId, {
    status,
    page,
    limit
  });

  const appointmentIds = result.consultations.map(c => c.appointmentId).filter(Boolean);
  const authHeader = req.headers.authorization;

  let prescriptionMap = {};
  if (appointmentIds.length > 0 && authHeader) {
    prescriptionMap = await fetchBulk(appointmentIds, `${baseUrl}prescriptions/appointments/bulk`, authHeader, 'prescription');
  }

  const enhancedConsultations = result.consultations.map(c => ({
    ...c,
    prescription: prescriptionMap[c.appointmentId] || null
  }));

  res.status(200).json({
    success: true,
    data: enhancedConsultations,
    pagination: result.pagination
  });
});

const getHistoryByDoctor = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { status, page, limit, startDate, endDate } = req.query;

  const result = await consultationService.getHistoryByDoctorId(doctorId, {
    status,
    page,
    limit,
    startDate,
    endDate
  });

  const appointmentIds = result.consultations.map(c => c.appointmentId).filter(Boolean);
  const authHeader = req.headers.authorization;

  let prescriptionMap = {};
  if (appointmentIds.length > 0 && authHeader) {
    prescriptionMap = await fetchBulk(appointmentIds, `${baseUrl}prescriptions/appointments/bulk`, authHeader, 'prescription');
  }

  const enhancedConsultations = result.consultations.map(c => ({
    ...c,
    prescription: prescriptionMap[c.appointmentId] || null
  }));

  res.status(200).json({
    success: true,
    data: enhancedConsultations,
    pagination: result.pagination
  });
});

const updateConsultation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const consultation = await consultationService.findById(id);
  if (!consultation) {
    throw ApiError.notFound('Consultation not found');
  }

  try {
    const updated = await consultationService.update(id, req.body);
    res.status(200).json({
      success: true,
      message: 'Consultation updated successfully',
      data: updated
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const markNoShow = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const consultation = await consultationService.markNoShow(id, reason);
    res.status(200).json({
      success: true,
      message: 'Consultation marked as no-show',
      data: consultation
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const saveHealthDetails = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const {
    patientId,
    doctorId,
    hospitalId,
    weight,
    height,
    bloodPressure,
    temperature,
    pulse,
    spo2,
    sugarLevel,
    consultationReason,
    allergies,
    criticalConditions,
    medications,
    lifestyleHabits
  } = req.body;

  const { vitals } = await consultationService.ensureConsultationAndSaveHealthDetails(appointmentId, patientId, doctorId, {
    hospitalId,
    weight,
    height,
    bloodPressure,
    temperature,
    pulse,
    spo2,
    sugarLevel,
    consultationReason,
    allergies,
    criticalConditions,
    medications,
    lifestyleHabits,
  });

  res.status(200).json({
    success: true,
    message: 'Health details saved successfully',
    data: vitals
  });
});

const broadcastExtension = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const { newEndTime, extendedByMinutes } = req.body;

  console.log(`[RECEIVE DEBUG] Received extension broadcast request for Appointment: ${appointmentId}`);
  console.log(`[RECEIVE DEBUG] Payload: NewEndTime=${newEndTime}, ExtendedByMinutes=${extendedByMinutes}`);

  emitToRoom(appointmentId, CONSULTATION_EVENTS.CALL_EXTENDED, {
    appointmentId,
    newEndTime,
    extendedByMinutes,
  });

  res.status(200).json({
    success: true,
    message: 'Extension broadcasted',
  });
});

const getHealthDetails = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;

  const vitals = await consultationService.getHealthDetailsByAppointmentId(appointmentId);

  res.status(200).json({
    success: true,
    data: vitals
  });
});

// ─── Review Methods ────────────────────────────────────────────────────────────

const submitReview = asyncHandler(async (req, res) => {
  const { id: consultationId } = req.params;
  const userId = req.headers['x-user-id'];
  const userRole = req.headers['x-user-role'];

  // Auth: only patients
  if (!userRole || userRole.toUpperCase() !== 'PATIENT') {
    return res.status(403).json({ success: false, message: 'Only patients can submit reviews.' });
  }

  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId } });

  if (!consultation) {
    return res.status(404).json({ success: false, message: 'Consultation not found.' });
  }

  // Authorization: patient must own this consultation
  if (consultation.patientId !== userId && consultation.patientAuthId !== userId) {
    return res.status(403).json({ success: false, message: 'You do not have permission to review this consultation.' });
  }

  // Must be COMPLETED
  if (consultation.status !== 'COMPLETED') {
    return res.status(400).json({ success: false, message: 'Can only review a completed consultation.' });
  }

  // Cannot review twice
  if (consultation.reviewedAt !== null) {
    return res.status(409).json({ success: false, message: 'This consultation has already been reviewed.' });
  }

  const { rating, comment, isAnonymous } = req.body || {};

  // Validate rating if provided
  if (rating !== undefined && rating !== null) {
    const ratingNum = parseInt(rating, 10);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be an integer between 1 and 5.' });
    }
  }

  const updated = await prisma.consultation.update({
    where: { id: consultationId },
    data: {
      rating: rating !== undefined && rating !== null ? parseInt(rating, 10) : null,
      comment: comment ?? null,
      isAnonymous: isAnonymous ?? false,
      reviewedAt: new Date(),
    }
  });

  res.status(200).json({ success: true, data: updated });
});

const getDoctorRating = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;

  console.log(`[getDoctorRating] Querying rating for doctorId: ${doctorId}`);
  const aggregate = await prisma.consultation.aggregate({
    where: { doctorId, rating: { not: null } },
    _avg: { rating: true },
    _count: { rating: true },
  });
  console.log(`[getDoctorRating] Result for ${doctorId}:`, aggregate);

  const breakdown = await prisma.consultation.groupBy({
    by: ['rating'],
    where: { doctorId, rating: { not: null } },
    _count: { rating: true },
  });

  const ratingBreakdown = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
  for (const row of breakdown) {
    if (row.rating !== null) {
      ratingBreakdown[String(row.rating)] = row._count.rating;
    }
  }

  const averageRating = aggregate._avg.rating
    ? Math.round(aggregate._avg.rating * 10) / 10
    : 0;

  res.status(200).json({
    success: true,
    data: {
      averageRating,
      totalReviews: aggregate._count.rating,
      ratingBreakdown,
    }
  });
});

const getDoctorsRatingsBulk = asyncHandler(async (req, res) => {
  const { doctorIds } = req.body;

  if (!doctorIds || !Array.isArray(doctorIds)) {
    return res.status(400).json({ success: false, message: 'doctorIds must be an array.' });
  }

  if (doctorIds.length === 0) {
    return res.status(200).json({ success: true, data: {} });
  }

  // 1. Get average and total count per doctor
  const aggregates = await prisma.consultation.groupBy({
    by: ['doctorId'],
    where: {
      doctorId: { in: doctorIds },
      rating: { not: null },
    },
    _avg: { rating: true },
    _count: { rating: true },
  });

  // 2. Get star breakdown per doctor
  const breakdowns = await prisma.consultation.groupBy({
    by: ['doctorId', 'rating'],
    where: {
      doctorId: { in: doctorIds },
      rating: { not: null },
    },
    _count: { rating: true },
  });

  const ratingMap = {};
  
  // Initialize for all requested IDs
  doctorIds.forEach(id => {
    ratingMap[id] = { 
      averageRating: 0, 
      totalReviews: 0,
      ratingBreakdown: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }
    };
  });

  // Map aggregates
  aggregates.forEach((row) => {
    if (ratingMap[row.doctorId]) {
      ratingMap[row.doctorId].averageRating = row._avg.rating ? Math.round(row._avg.rating * 10) / 10 : 0;
      ratingMap[row.doctorId].totalReviews = row._count.rating;
    }
  });

  // Map breakdowns
  breakdowns.forEach((row) => {
    if (ratingMap[row.doctorId] && row.rating !== null) {
      ratingMap[row.doctorId].ratingBreakdown[String(row.rating)] = row._count.rating;
    }
  });

  res.status(200).json({
    success: true,
    data: ratingMap,
  });
});

const getConsultationReviews = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '10', 10);
  const skip = (page - 1) * limit;

  const where = {
    doctorId,
    rating: { not: null },
    reviewedAt: { not: null },
  };

  const [consultations, total] = await Promise.all([
    prisma.consultation.findMany({
      where,
      select: {
        id: true,
        patientId: true,
        rating: true,
        comment: true,
        isAnonymous: true,
        reviewedAt: true,
      },
      orderBy: { reviewedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.consultation.count({ where }),
  ]);

  // Fetch patient names for non-anonymous reviews
  const patientIds = [...new Set(consultations.filter(c => !c.isAnonymous).map(c => c.patientId))];
  const patientMap = await profileClient.getPatientsByBulkIds(patientIds);

  const reviews = consultations.map((c) => {
    let patientName = 'Patient'; // Default fallback
    if (c.isAnonymous) {
      patientName = 'Anonymous';
    } else {
      const profile = patientMap[c.patientId];
      if (profile) {
        patientName = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim() || 'Patient';
      }
    }

    return {
      id: c.id,
      patientName,
      rating: c.rating,
      comment: c.comment,
      reviewedAt: c.reviewedAt,
    };
  });

  res.status(200).json({
    success: true,
    data: {
      reviews,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  });
});

const getConsultationsByBulkIds = asyncHandler(async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw ApiError.badRequest('ids must be a non-empty array');
  }

  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length > 100) {
    throw ApiError.badRequest('Maximum 100 ids allowed per request');
  }

  const consultations = await consultationService.findByIds(uniqueIds);

  const consultationMap = {};

  consultations.forEach((consultation) => {
    // Map by both ID and appointmentId for flexible lookup
    consultationMap[consultation.id] = consultation;
    if (consultation.appointmentId) {
      consultationMap[consultation.appointmentId] = consultation;
    }
  });

  res.status(200).json({
    success: true,
    data: consultationMap,
    count: consultations.length
  });
});

module.exports = {
  createConsultation,
  getConsultationById,
  getConsultationByAppointment,
  joinLobby,
  requestConsent,
  acceptConsent,
  startConsultation,
  endConsultation,
  endByAppointment,
  getHistoryByPatient,
  getHistoryByDoctor,
  updateConsultation,
  markNoShow,
  saveHealthDetails,
  getHealthDetails,
  broadcastExtension,
  submitReview,
  getDoctorRating,
  getDoctorsRatingsBulk,
  getConsultationReviews,
  getConsultationsByBulkIds,
};