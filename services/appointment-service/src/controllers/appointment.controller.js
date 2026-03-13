const appointmentService = require("../service/appointment.service");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const axios = require("axios");

const baseUrl = process.env.BASE_URL;

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
    limit = 20,
  } = req.query;

  const filters = {
    patientId,
    doctorId,
    status,
    paymentStatus,
    consultationType,
    startDate,
    endDate,
  };

  const pagination = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  const result = await appointmentService.findAll(filters, pagination);

  if (!result || !result.appointments) {
    return res.status(200).json({
      success: true,
      data: [],
      pagination: result?.pagination || {},
    });
  }

  const doctorIds = [
    ...new Set(
      result.appointments
        .map((appointment) => { 
          return appointment.doctorId; })
        .filter(Boolean),
    ),
  ];

  const patientIds = [
    ...new Set(
      result.appointments
        .map((appointment) => appointment.patientId)
        .filter(Boolean),
    ),
  ];

  let doctorMap = {};
  let patientMap = {};
  const authHeader = req.headers.authorization;

  if (doctorIds.length > 0) {
    const doctorResponses = await Promise.all(
      doctorIds.map((id) =>
        axios.get(`${baseUrl}profiles/doctors/${id}`, {
          headers: {
            Authorization: authHeader,
          },
        }),
      ),
    );

    doctorResponses.forEach((resp) => {
      const doctor = resp.data?.data;
      if (doctor) {
        doctorMap[doctor.id] = doctor;
      }
    });
  }

  if (patientIds.length > 0) {
    const patientResponses = await Promise.all(
      patientIds.map((id) =>
        axios.get(`${baseUrl}profiles/patients/${id}`, {
          headers: {
            Authorization: authHeader,
          },
        }),
      ),
    );

    patientResponses.forEach((resp) => {
      const patient = resp.data?.data;
      if (patient) {
        patientMap[patient.id] = patient;
      }
    });
  }

  // -----------------------------
  // Merge Doctor Data Into Appointments
  // -----------------------------
  const transformedAppointments = result.appointments.map((appointment) => ({
    ...appointment,
    doctor: doctorMap[appointment.doctorId] || null,
    patient: patientMap[appointment.patientId] || null,
  }));

  // -----------------------------
  // Final Response
  // -----------------------------
  res.status(200).json({
    success: true,
    data: transformedAppointments,
    pagination: result.pagination,
  });
});

// const getAllAppointments = asyncHandler(async (req, res) => {
//   const {
//     patientId,
//     doctorId,
//     status,
//     paymentStatus,
//     consultationType,
//     startDate,
//     endDate,
//     page = 1,
//     limit = 20,
//   } = req.query;

//   const filters = {
//     patientId,
//     doctorId,
//     status,
//     paymentStatus,
//     consultationType,
//     startDate,
//     endDate,
//   };

//   const pagination = {
//     page: parseInt(page, 10),
//     limit: parseInt(limit, 10),
//   };

//   const result = await appointmentService.findAll(filters, pagination);

//   if (!result || !result.appointments) {
//     return res.status(200).json({
//       success: true,
//       data: [],
//       pagination: result?.pagination || {},
//     });
//   }

//   const doctorIds = [
//     ...new Set(
//       result.appointments
//         .map((appointment) => appointment.doctorId)
//         .filter(Boolean),
//     ),
//   ];

//   const patientIds = [
//     ...new Set(
//       result.appointments
//         .map((appointment) => appointment.patientId)
//         .filter(Boolean),
//     ),
//   ];

//   let doctorMap = {};
// let patientMap = {};

// const authHeader = req.headers.authorization;

// //
// // 🔹 BULK DOCTOR FETCH
// //
// if (doctorIds.length > 0) {
//   const doctorResponse = await axios.post(
//     `${baseUrl}profiles/doctors/bulk`,
//     { ids: doctorIds },
//     {
//       headers: {
//         Authorization: authHeader,
//       },
//     },
//   );

//   doctorMap = doctorResponse.data?.data || {};
// }

// //
// // 🔹 BULK PATIENT FETCH
// //
// if (patientIds.length > 0) {
//   const patientResponse = await axios.post(
//     `${baseUrl}profiles/patients/bulk`,
//     { ids: patientIds },
//     {
//       headers: {
//         Authorization: authHeader,
//       },
//     },
//   );

//   patientMap = patientResponse.data?.data || {};
// }
//   // -----------------------------
//   // Merge Doctor Data Into Appointments
//   // -----------------------------
//   const transformedAppointments = result.appointments.map((appointment) => ({
//     ...appointment,
//     doctor: doctorMap[appointment.doctorId] || null,
//     patient: patientMap[appointment.patientId] || null,
//   }));

//   // -----------------------------
//   // Final Response
//   // -----------------------------
//   res.status(200).json({
//     success: true,
//     data: transformedAppointments,
//     pagination: result.pagination,
//   });
// });

const getAppointmentById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  res.status(200).json({
    success: true,
    data: appointment,
  });
});

const createAppointment = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.create(req.body);

  res.status(201).json({
    success: true,
    message: "Appointment created successfully",
    data: appointment,
  });
});

const updateAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  const updatedAppointment = await appointmentService.update(id, req.body);

  res.status(200).json({
    success: true,
    message: "Appointment updated successfully",
    data: updatedAppointment,
  });
});

const cancelAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  const cancelledAppointment = await appointmentService.cancel(id, reason);

  res.status(200).json({
    success: true,
    message: "Appointment cancelled successfully",
    data: cancelledAppointment,
  });
});

const rescheduleAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newSlotId } = req.body;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  const rescheduledAppointment = await appointmentService.reschedule(
    id,
    newSlotId,
  );

  res.status(200).json({
    success: true,
    message: "Appointment rescheduled successfully",
    data: rescheduledAppointment,
  });
});

const confirmAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  const confirmedAppointment = await appointmentService.confirm(id);

  res.status(200).json({
    success: true,
    message: "Appointment confirmed successfully",
    data: confirmedAppointment,
  });
});

const completeAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  const completedAppointment = await appointmentService.complete(id);

  res.status(200).json({
    success: true,
    message: "Appointment marked as completed",
    data: completedAppointment,
  });
});


const markMissedAsNoShow = asyncHandler(async (req, res) => {
  const { doctorId } = req.query;
  const result = await appointmentService.markMissedAsNoShow(doctorId);
  res.status(200).json({
    success: true,
    message: `Marked ${result.count} missed appointment(s) as no-show`,
    data: result
  });
});

const markNoShow = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  const updatedAppointment = await appointmentService.markNoShow(id);

  res.status(200).json({
    success: true,
    message: "Appointment marked as no-show",
    data: updatedAppointment,
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
  markMissedAsNoShow,
  markNoShow,
};
