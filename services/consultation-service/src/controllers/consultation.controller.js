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

  if (!consultation) {
    throw ApiError.notFound('Consultation not found');
  }

  res.status(200).json({
    success: true,
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
  const { status, page, limit } = req.query;

  const result = await consultationService.getHistoryByDoctorId(doctorId, {
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

module.exports = {
  createConsultation,
  getConsultationById,
  getConsultationByAppointment,
  startConsultation,
  endConsultation,
  getHistoryByPatient,
  getHistoryByDoctor,
  updateConsultation,
  markNoShow
};
