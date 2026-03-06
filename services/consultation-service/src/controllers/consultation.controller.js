const consultationService = require('../service/consultation.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const createConsultation = asyncHandler(async (req, res) => {
  try {
    const consultation = await consultationService.create(req.body);
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
  const { patientId, doctorId } = req.body;

  // Note: x-user-id from gateway (JWT) may be auth user id; appointment patientId is profile id.
  // They often differ, so we do not block join when they mismatch. Rely on auth + knowing appointment ids.
  const { consultation, channelName } = await consultationService.joinLobby(appointmentId, patientId, doctorId);
  res.status(200).json({
    success: true,
    message: 'Joined lobby',
    data: { ...consultation, channelName }
  });
});

const requestConsent = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;

  const consultation = await consultationService.requestConsent(appointmentId);
  res.status(200).json({
    success: true,
    message: 'Consent requested',
    data: consultation
  });
});

const acceptConsent = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;

  const consultation = await consultationService.acceptConsent(appointmentId);
  res.status(200).json({
    success: true,
    message: 'Consent accepted',
    data: consultation
  });
});

const startConsultation = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;

  try {
    const consultation = await consultationService.start(appointmentId);
    res.status(200).json({
      success: true,
      message: 'Consultation started',
      data: consultation
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const endConsultation = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const consultation = await consultationService.end(id);
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
  const { endedBy } = req.body || {};
  const who = endedBy === 'patient' ? 'patient' : 'doctor';

  try {
    const { consultation } = await consultationService.endByAppointment(appointmentId, who);
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
  const { patientId, doctorId, weight, height, bloodPressure, temperature, pulse, spo2, sugarLevel, consultationReason, allergies, criticalConditions } = req.body;

  const { vitals } = await consultationService.ensureConsultationAndSaveHealthDetails(appointmentId, patientId, doctorId, {
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
