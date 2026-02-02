const appointmentService = require('../service/appointment.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const getAllAppointments = asyncHandler(async (req, res) => {
  const {
    patientId,
    doctorId,
    status,
    paymentStatus,
    consultationType,
    startDate,
    endDate,
    page = 1,
    limit = 20
  } = req.query;

  const filters = {
    patientId,
    doctorId,
    status,
    paymentStatus,
    consultationType,
    startDate,
    endDate
  };

  const pagination = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10)
  };

  const result = await appointmentService.findAll(filters, pagination);

  res.status(200).json({
    success: true,
    data: result.appointments,
    pagination: {
      page: result.pagination.page,
      limit: result.pagination.limit,
      total: result.pagination.total,
      totalPages: result.pagination.totalPages
    }
  });
});

const getAppointmentById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound('Appointment not found');
  }

  res.status(200).json({
    success: true,
    data: appointment
  });
});

const createAppointment = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.create(req.body);

  res.status(201).json({
    success: true,
    message: 'Appointment created successfully',
    data: appointment
  });
});

const updateAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound('Appointment not found');
  }

  const updatedAppointment = await appointmentService.update(id, req.body);

  res.status(200).json({
    success: true,
    message: 'Appointment updated successfully',
    data: updatedAppointment
  });
});

const cancelAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound('Appointment not found');
  }

  const cancelledAppointment = await appointmentService.cancel(id, reason);

  res.status(200).json({
    success: true,
    message: 'Appointment cancelled successfully',
    data: cancelledAppointment
  });
});

const rescheduleAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newSlotId } = req.body;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound('Appointment not found');
  }

  const rescheduledAppointment = await appointmentService.reschedule(id, newSlotId);

  res.status(200).json({
    success: true,
    message: 'Appointment rescheduled successfully',
    data: rescheduledAppointment
  });
});

const confirmAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound('Appointment not found');
  }

  const confirmedAppointment = await appointmentService.confirm(id);

  res.status(200).json({
    success: true,
    message: 'Appointment confirmed successfully',
    data: confirmedAppointment
  });
});

const completeAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound('Appointment not found');
  }

  const completedAppointment = await appointmentService.complete(id);

  res.status(200).json({
    success: true,
    message: 'Appointment marked as completed',
    data: completedAppointment
  });
});

const markNoShow = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound('Appointment not found');
  }

  const updatedAppointment = await appointmentService.markNoShow(id);

  res.status(200).json({
    success: true,
    message: 'Appointment marked as no-show',
    data: updatedAppointment
  });
});

module.exports = {
  getAllAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  rescheduleAppointment,
  confirmAppointment,
  completeAppointment,
  markNoShow
};
