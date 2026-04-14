const appointmentService = require("../service/appointment.service");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const axios = require("axios");

const baseUrl = process.env.BASE_URL;

async function fetchProfilesBulk(ids, bulkUrl, authHeader, entityName) {
  if (ids.length === 0) return {};

  try {
    const response = await axios.post(
      bulkUrl,
      { ids },
      {
        headers: {
          Authorization: authHeader,
        },
      },
    );

    return response.data?.data || {};
  } catch (err) {
    console.error(
      `[appointments] Bulk ${entityName} fetch failed:`,
      err.response?.status,
      err.response?.data?.message || err.message,
    );
    return {};
  }
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
    search,
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
    search,
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
    ...new Set(result.appointments.map((a) => a.doctorId).filter(Boolean)),
  ];

  const patientIds = [
    ...new Set(result.appointments.map((a) => a.patientId).filter(Boolean)),
  ];

  let doctorMap = {};
  let patientMap = {};
  const authHeader = req.headers.authorization;

  await Promise.all([
    // ── Bulk patient fetch ────────────────────────────────────────────────────
    patientIds.length > 0
      ? fetchProfilesBulk(
          patientIds,
          `${baseUrl}profiles/patients/bulk`,
          authHeader,
          "patient",
        ).then((m) => {
          patientMap = m;
        })
      : Promise.resolve(),

    // ── Bulk doctor fetch ─────────────────────────────────────────────────────
    doctorIds.length > 0
      ? fetchProfilesBulk(
          doctorIds,
          `${baseUrl}profiles/doctors/bulk`,
          authHeader,
          "doctor",
        ).then((m) => {
          doctorMap = m;
        })
      : Promise.resolve(),
  ]);

  const transformedAppointments = result.appointments
    .map((appointment) => ({
      ...appointment,
      doctor: doctorMap[appointment.doctorId] || null,
      patient: patientMap[appointment.patientId] || null,
    }))
    .filter(
      (appointment) =>
        appointment.doctor !== null && appointment.patient !== null,
    );

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

const extendAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  try {
    const updatedAppointment = await appointmentService.extend(id);
    res.status(200).json({
      success: true,
      message: "Appointment extended successfully",
      newEndTime: updatedAppointment.slot.endTime,
      extendedByMinutes: parseInt(process.env.CALL_EXTEND_DURATION_MINUTES || "5", 10),
    });
  } catch (error) {
    if (error.reason === "NEXT_SLOT_BOOKED") {
      return res.status(409).json({
        success: false,
        reason: "NEXT_SLOT_BOOKED",
        message: error.message,
      });
    }
    throw error;
  }
});

const getHospitalPatients = asyncHandler(async (req, res) => {
  const { hospitalId } = req.params;

  console.log(hospitalId, "Hospital ID");
  const { page = 1, limit = 20, search } = req.query;

  const pagination = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
  };

  const normalizedSearch = String(search || "")
    .trim()
    .toLowerCase();
  const authHeader = req.headers.authorization;

  if (normalizedSearch) {
    const allPatientIds =
      await appointmentService.getAllHospitalPatientIds(hospitalId);

    const chunkSize = 100;
    const patientProfileById = {};

    for (let i = 0; i < allPatientIds.length; i += chunkSize) {
      const chunkIds = allPatientIds.slice(i, i + chunkSize).map((x) => x.id);
      const map = await fetchProfilesBulk(
        chunkIds,
        `${baseUrl}profiles/patients/bulk`,
        authHeader,
        "patient",
      );
      Object.assign(patientProfileById, map);
    }

    const matchesSearch = (profile) => {
      if (!profile) return false;

      const fullName = `${profile.firstName || ""} ${profile.lastName || ""}`
        .trim()
        .toLowerCase();

      return (
        fullName.includes(normalizedSearch) ||
        String(profile.email || "")
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(profile.emiratesId || "")
          .toLowerCase()
          .includes(normalizedSearch) ||
        String(profile.mobileNumber || "")
          .toLowerCase()
          .includes(normalizedSearch)
      );
    };

    const matched = allPatientIds
      .filter((x) => matchesSearch(patientProfileById[x.id]))
      .map((x) => ({
        id: x.id,
        createdAt: x.lastVisit,
        profile: patientProfileById[x.id] || null,
      }));

    const total = matched.length;
    const totalPages = Math.max(1, Math.ceil(total / pagination.limit));
    const safePage = Math.min(Math.max(1, pagination.page), totalPages);
    const start = (safePage - 1) * pagination.limit;

    return res.status(200).json({
      success: true,
      data: matched.slice(start, start + pagination.limit),
      pagination: {
        page: safePage,
        limit: pagination.limit,
        total,
        totalPages,
      },
    });
  }

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

  // authHeader defined above

  // ✅ Single bulk call instead of N individual calls
  const patientMap = await fetchProfilesBulk(
    patientIds,
    `${baseUrl}profiles/patients/bulk`,
    authHeader,
    "patient",
  );

  const transformedPatients = result.patients.map((patient) => ({
    ...patient,
    profile: patientMap[patient.id] || null,
  }));

  res.status(200).json({
    success: true,
    data: transformedPatients,
    pagination: result.pagination,
  });
});

const getPreviouslyConsultedDoctors = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const authHeader = req.headers.authorization;

  const doctors =
    await appointmentService.getPreviouslyConsultedDoctors(patientId);

  const doctorIds = doctors.map((d) => d.doctorId).filter(Boolean);

  // 🔥 Bulk fetch doctor profiles
  const doctorProfiles = await fetchProfilesBulk(
    doctorIds,
    `${baseUrl}profiles/doctors/bulk`,
    authHeader,
    "doctor",
  );

  const result = doctors.map((doc) => ({
    doctorId: doc.doctorId,
    lastConsultedAt: doc.lastConsultedAt,
    profile: doctorProfiles[doc.doctorId] || null,
  }));

  res.status(200).json({
    success: true,
    data: result,
  });
});

module.exports = {
  getAllAppointments,
  getAppointmentById,
  getPreviouslyConsultedDoctors,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  rescheduleAppointment,
  confirmAppointment,
  completeAppointment,
  markMissedAsNoShow,
  markNoShow,
  extendAppointment,
  getHospitalPatients,
};
