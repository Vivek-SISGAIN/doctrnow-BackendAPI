const appointmentService = require("../service/appointment.service");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const axios = require("axios");

const baseUrl = process.env.BASE_URL;

async function fetchProfilesByIds(ids, buildUrl, authHeader, entityName) {
  const responses = await Promise.allSettled(
    ids.map((id) =>
      axios.get(buildUrl(id), {
        headers: {
          Authorization: authHeader,
        },
      }),
    ),
  );

  const profileMap = {};

  responses.forEach((result, index) => {
    const requestedId = ids[index];

    if (result.status === "fulfilled") {
      const profile = result.value.data?.data;
      if (profile?.id) {
        profileMap[profile.id] = profile;
      }
      return;
    }

    const status = result.reason?.response?.status;
    if (status === 404) {
      console.warn(
        `[appointments] Missing ${entityName} profile for referenced id ${requestedId}`,
      );
      return;
    }

    throw result.reason;
  });

  return profileMap;
}

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
//         .map((appointment) => {
//           return appointment.doctorId;
//         })
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
//   let patientMap = {};
//   const authHeader = req.headers.authorization;

//   if (doctorIds.length > 0) {
//     doctorMap = await fetchProfilesByIds(
//       doctorIds,
//       (id) => `${baseUrl}profiles/doctors/${id}`,
//       authHeader,
//       "doctor",
//     );
//   }

//   if (patientIds.length > 0) {
//     patientMap = await fetchProfilesByIds(
//       patientIds,
//       (id) => `${baseUrl}profiles/patients/${id}`,
//       authHeader,
//       "patient",
//     );
//   }

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

const getAllAppointments = asyncHandler(async (req, res) => {
  const {
    patientId,
    doctorId,
    hospitalId,
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
    hospitalId,
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
 
  const doctorIds = [...new Set(
    result.appointments.map((a) => a.doctorId).filter(Boolean)
  )];
 
  const patientIds = [...new Set(
    result.appointments.map((a) => a.patientId).filter(Boolean)
  )];
 
  let doctorMap = {};
  let patientMap = {};
 
  await Promise.all([
 
    // ── Bulk patient fetch ────────────────────────────────────────────────────
    patientIds.length > 0
      ? axios
          .post(`${baseUrl}profiles/patients/bulk`, { ids: patientIds })
          .then((r) => { patientMap = r.data?.data || {}; })
          .catch((err) => {
            console.error(
              '[getAllAppointments] Bulk patient fetch failed:',
              err.response?.status,
              err.response?.data?.message || err.message,
            );
          })
      : Promise.resolve(),
 
    // ── Bulk doctor fetch ─────────────────────────────────────────────────────
    doctorIds.length > 0
      ? axios
          .post(`${baseUrl}profiles/doctors/bulk`, { ids: doctorIds })
          .then((r) => { doctorMap = r.data?.data || {}; })
          .catch((err) => {
            console.error(
              '[getAllAppointments] Bulk doctor fetch failed:',
              err.response?.status,
              err.response?.data?.message || err.message,
            );
          })
      : Promise.resolve(),
 
  ]);
 
  const transformedAppointments = result.appointments.map((appointment) => ({
    ...appointment,
    doctor: doctorMap[appointment.doctorId] || null,
    patient: patientMap[appointment.patientId] || null,
  }));
 
  res.status(200).json({
    success: true,
    data: transformedAppointments,
    pagination: result.pagination,
  });
});

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
    data: result,
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

const getHospitalPatients = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;

  console.log(hospitalId , "Hospital ID")
  const { page = 1, limit = 20 } = req.query;

  const pagination = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  // 🔥 Service call
  const result = await appointmentService.getHospitalPatients(
    hospitalId,
    pagination,
  );

  if (!result || !result.patients) {
    return res.status(200).json({
      success: true,
      data: [],
      pagination: result?.pagination || {},
    });
  }

  const patientIds = [
    ...new Set(result.patients.map((p) => p.id).filter(Boolean)),
  ];

  let patientMap = {};
  const authHeader = req.headers.authorization;

  if (patientIds.length > 0) {
    patientMap = await fetchProfilesByIds(
      patientIds,
      (id) => `${baseUrl}profiles/patients/${id}`,
      authHeader,
      "patient",
    );
  }

  const transformedPatients = result.patients.map((patient) => ({
    ...patient,
    profile: patientMap[patient.id] || null,
  }));

  // -----------------------------
  // Final Response
  // -----------------------------
  res.status(200).json({
    success: true,
    data: transformedPatients,
    pagination: result.pagination,
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
  getHospitalPatients
};
