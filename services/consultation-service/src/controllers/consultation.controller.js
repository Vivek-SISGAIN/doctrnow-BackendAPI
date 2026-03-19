const consultationService = require('../service/consultation.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { emitToRoom, emitToDoctorRoom, CONSULTATION_EVENTS } = require('../utils/socket');
const chatClient = require('../utils/chat-client');
const profileClient = require('../utils/profile-client');


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

  res.status(200).json({
    success: true,
    data: consultation
  });
});

const getConsultationByAppointment = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const consultation = await consultationService.findByAppointmentId(appointmentId);

  // No consultation yet = patient has not joined the lobby; return 200 with null so UI can show "Patient not in lobby" instead of an error
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

  // Fire-and-forget — never block the lobby join on chat session creation
  const jwtUserId = req.headers['x-user-id'];
  const jwtRole = req.headers['x-user-role'];

  if (consultation?.id) {
    // Save the Clerk userId into the consultation record if it's the patient joining
    if (jwtRole === 'PATIENT' && jwtUserId) {
      await consultationService.update(consultation.id, { patientAuthId: jwtUserId });
      // Update the local object so we use the correct ID for session creation
      consultation.patientAuthId = jwtUserId;
    }

    const chatPatientId = consultation.patientAuthId || consultation.patientId;
    const chatDoctorId = consultation.doctorAuthId || consultation.doctorId;

    // Fetch patient name/avatar for chat inbox enrichment
    const patientProfile = await profileClient.getPatientProfile(consultation.patientId);
    const patientName = patientProfile ? `${patientProfile.firstName} ${patientProfile.lastName}` : null;
    const patientAvatar = patientProfile ? patientProfile.profileImage : null;

    chatClient.createSession(consultation.id, chatPatientId, chatDoctorId, patientName, patientAvatar); // ← no await
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
      const oldDoctorId = consultation.doctorAuthId || consultation.doctorId;
      if (jwtRole === 'DOCTOR' && jwtUserId && consultation.doctorAuthId !== jwtUserId) {
        await consultationService.update(consultation.id, { doctorAuthId: jwtUserId });
        // Trigger participant ID update in MongoDB to replace placeholder UUID with Clerk userId
        chatClient.updateParticipantUserId(consultation.id, oldDoctorId, jwtUserId); // Fire-and-forget
        consultation.doctorAuthId = jwtUserId;
      }

      const chatPatientId = consultation.patientAuthId || consultation.patientId;
      const chatDoctorId = consultation.doctorAuthId || consultation.doctorId;

      // Fetch patient name/avatar for chat inbox enrichment
      const patientProfile = await profileClient.getPatientProfile(consultation.patientId);
      const patientName = patientProfile ? `${patientProfile.firstName} ${patientProfile.lastName}` : null;
      const patientAvatar = patientProfile ? patientProfile.profileImage : null;

      chatClient.createSession(consultation.id, chatPatientId, chatDoctorId, patientName, patientAvatar); // ← no await
      await chatClient.startSession(consultation.id); // ← keep await, this one is needed
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

  res.status(200).json({
    success: true,
    data: result.consultations,
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

  res.status(200).json({
    success: true,
    data: result.consultations,
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
  const { patientId, doctorId, hospitalId, weight, height, bloodPressure, temperature, pulse, spo2, sugarLevel, consultationReason, allergies, criticalConditions } = req.body;

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
    criticalConditions
  });

  res.status(200).json({
    success: true,
    message: 'Health details saved successfully',
    data: vitals
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
  getHealthDetails
};
