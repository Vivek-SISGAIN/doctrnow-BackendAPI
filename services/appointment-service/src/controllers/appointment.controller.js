const appointmentService = require("../service/appointment.service");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { publishAuditEvent, extractActor } = require("../utils/auditPublisher");
const axios = require("axios");

const baseUrl = process.env.BASE_URL;
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

async function fetchProfilesBulk(ids, bulkUrl, authHeader, entityName, search) {
  if (ids.length === 0) return {};

  try {
    const response = await axios.post(
      bulkUrl,
      { ids, search },
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
    specialty,
    page = 1,
    limit = 20,
  } = req.query;

  let finalDoctorId = doctorId;
  const authHeader = req.headers.authorization;

  if (specialty) {
    try {
      const docsRes = await axios.get(`${baseUrl}profiles/doctors/`, {
        params: { specialization: specialty, limit: 1000 },
        headers: { Authorization: authHeader },
      });
      const matchedDoctorIds = docsRes.data?.data?.map((d) => d.id) || [];

      if (doctorId) {
        if (!matchedDoctorIds.includes(doctorId)) {
          return res.status(200).json({ success: true, data: [], pagination: {} });
        }
      } else {
        finalDoctorId = matchedDoctorIds;
        if (finalDoctorId.length === 0) {
          return res.status(200).json({ success: true, data: [], pagination: {} });
        }
      }
    } catch (err) {
      console.error("[appointments] Failed to fetch specialty doctors:", err.message);
      return res.status(200).json({ success: true, data: [], pagination: {} });
    }
  }

  const filters = {
    patientId,
    doctorId: finalDoctorId,
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

  const appointmentIds = result.appointments.map((a) => a.id).filter(Boolean);

  let doctorMap = {};
  let patientMap = {};
  let prescriptionMap = {};

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

    // ── Bulk prescription fetch ─────────────────────────────────────────────────────
    appointmentIds.length > 0
      ? fetchProfilesBulk(
          appointmentIds,
          `${baseUrl}prescriptions/appointments/bulk`,
          authHeader,
          "prescription",
        ).then((m) => {
          prescriptionMap = m;
        })
      : Promise.resolve(),
  ]);

  // ── Bulk document count fetch (list endpoint — count only) ─────────────────
  let documentCountMap = {};
  if (appointmentIds.length > 0) {
    try {
      const docRes = await axios.post(
        `${baseUrl}documents/appointments/bulk`,
        { ids: appointmentIds },
        {
          headers: {
            Authorization: authHeader,
            'x-internal-secret': INTERNAL_SECRET,
          },
          timeout: 5000,
        },
      );
      const docData = docRes.data?.data || {};
      // Extract count only for list performance
      Object.entries(docData).forEach(([aptId, docs]) => {
        documentCountMap[aptId] = Array.isArray(docs) ? docs.length : 0;
      });
    } catch (err) {
      console.warn('[appointments] Document count fetch failed:', err.message);
    }
  }

  const transformedAppointments = result.appointments
    .map((appointment) => ({
      ...appointment,
      doctor: doctorMap[appointment.doctorId] || null,
      patient: patientMap[appointment.patientId] || null,
      prescription: prescriptionMap[appointment.id] || null,
      documentCount: documentCountMap[appointment.id] ?? 0,
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

  const authHeader = req.headers.authorization;
  if (authHeader) {
    // ── Bulk fetch profiles (Patient, Doctor, Prescription) ───────────────────
    const [patientMap, doctorMap, prescriptionMap] = await Promise.all([
      fetchProfilesBulk(
        [appointment.patientId],
        `${baseUrl}profiles/patients/bulk`,
        authHeader,
        "patient",
      ),
      fetchProfilesBulk(
        [appointment.doctorId],
        `${baseUrl}profiles/doctors/bulk`,
        authHeader,
        "doctor",
      ),
      fetchProfilesBulk(
        [appointment.id],
        `${baseUrl}prescriptions/appointments/bulk`,
        authHeader,
        "prescription",
      ),
    ]);

    appointment.patient = patientMap[appointment.patientId] || null;
    appointment.doctor = doctorMap[appointment.doctorId] || null;
    appointment.prescription = prescriptionMap[appointment.id] || null;

    // ── Augment with full documents array (detail endpoint) ───────────────────
    try {
      const docRes = await axios.post(
        `${baseUrl}documents/appointments/bulk`,
        { ids: [appointment.id] },
        {
          headers: {
            Authorization: authHeader,
            'x-internal-secret': INTERNAL_SECRET,
          },
          timeout: 5000,
        },
      );
      appointment.documents = docRes.data?.data?.[appointment.id] || [];
    } catch (err) {
      console.warn('[appointments] Document fetch failed for detail:', err.message);
      appointment.documents = [];
    }
  }

  res.status(200).json({
    success: true,
    data: appointment,
  });
});

const createAppointment = asyncHandler(async (req, res) => {
  const appointment = await appointmentService.create(req.body);
  const actor = extractActor(req);

  publishAuditEvent({
    hospitalId: appointment.hospitalId,
    entityType: 'APPOINTMENT',
    actionPerformed: 'Appointment Created',
    actionType: 'DATA_CHANGE',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    userId: actor.userId,
    userRole: actor.userRole,
    previousValue: null,
    newValue: appointment,
    remarks: `Appointment created for patient ${appointment.patientId}`,
    path: `/appointments/${appointment.id}`,
    method: 'POST',
    metadata: {
      appointmentId: appointment.id,
      doctorId: appointment.doctorId,
      patientId: appointment.patientId,
      slotId: appointment.slotId,
      type: appointment.type,
    },
  });

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
  const actor = extractActor(req);

  publishAuditEvent({
    hospitalId: appointment.hospitalId,
    entityType: 'APPOINTMENT',
    actionPerformed: 'Appointment Updated',
    actionType: 'DATA_CHANGE',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    userId: actor.userId,
    userRole: actor.userRole,
    previousValue: appointment,
    newValue: updatedAppointment,
    remarks: req.body?.remarks || `Appointment ${id} details updated`,
    path: `/appointments/${id}`,
    method: 'PATCH',
    metadata: {
      appointmentId: id,
      doctorId: appointment.doctorId,
      patientId: appointment.patientId,
    },
  });

  res.status(200).json({
    success: true,
    message: "Appointment updated successfully",
    data: updatedAppointment,
  });
});

const cancelAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const actorRole = req.headers["x-user-role"] || req.body.cancelledBy || req.body.actorRole;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  const cancelledAppointment = await appointmentService.cancel(id, reason, actorRole);
  const actor = extractActor(req);

  publishAuditEvent({
    hospitalId: appointment.hospitalId,
    entityType: 'APPOINTMENT',
    actionPerformed: 'Appointment Cancelled',
    actionType: 'WORKFLOW',
    performedByUserId: actor.userId,
    performedByRole: actorRole || actor.userRole,
    userId: actor.userId,
    userRole: actorRole || actor.userRole,
    previousValue: { status: appointment.status },
    newValue: { status: 'CANCELLED' },
    statusChange: { from: appointment.status, to: 'CANCELLED' },
    remarks: reason || `Appointment ${id} cancelled`,
    path: `/appointments/${id}/cancel`,
    method: 'PATCH',
    metadata: {
      appointmentId: id,
      reason,
    },
  });

  res.status(200).json({
    success: true,
    message: "Appointment cancelled successfully",
    data: cancelledAppointment,
  });
});

const rescheduleAppointment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newSlotId } = req.body;
  const actorRole = req.headers["x-user-role"] || req.body.rescheduledBy || req.body.actorRole;

  const appointment = await appointmentService.findById(id);

  if (!appointment) {
    throw ApiError.notFound("Appointment not found");
  }

  const rescheduledAppointment = await appointmentService.reschedule(
    id,
    newSlotId,
    actorRole,
  );
  const actor = extractActor(req);

  publishAuditEvent({
    hospitalId: appointment.hospitalId,
    entityType: 'APPOINTMENT',
    actionPerformed: 'Appointment Rescheduled',
    actionType: 'WORKFLOW',
    performedByUserId: actor.userId,
    performedByRole: actorRole || actor.userRole,
    userId: actor.userId,
    userRole: actorRole || actor.userRole,
    previousValue: { slotId: appointment.slotId },
    newValue: { slotId: newSlotId },
    statusChange: { from: appointment.status, to: rescheduledAppointment.status || appointment.status },
    remarks: req.body?.reason || `Appointment ${id} rescheduled to new slot`,
    path: `/appointments/${id}/reschedule`,
    method: 'PATCH',
    metadata: {
      appointmentId: id,
      oldSlotId: appointment.slotId,
      newSlotId,
    },
  });

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
  const actor = extractActor(req);

  publishAuditEvent({
    hospitalId: appointment.hospitalId,
    entityType: 'APPOINTMENT',
    actionPerformed: 'Appointment Confirmed',
    actionType: 'WORKFLOW',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    userId: actor.userId,
    userRole: actor.userRole,
    previousValue: { status: appointment.status },
    newValue: { status: 'CONFIRMED' },
    statusChange: { from: appointment.status, to: 'CONFIRMED' },
    remarks: `Appointment ${id} confirmed`,
    path: `/appointments/${id}/confirm`,
    method: 'PATCH',
    metadata: { appointmentId: id },
  });

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
  const actor = extractActor(req);

  publishAuditEvent({
    hospitalId: appointment.hospitalId,
    entityType: 'APPOINTMENT',
    actionPerformed: 'Appointment Completed',
    actionType: 'WORKFLOW',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    userId: actor.userId,
    userRole: actor.userRole,
    previousValue: { status: appointment.status },
    newValue: { status: 'COMPLETED' },
    statusChange: { from: appointment.status, to: 'COMPLETED' },
    remarks: `Appointment ${id} marked completed`,
    path: `/appointments/${id}/complete`,
    method: 'PATCH',
    metadata: { appointmentId: id },
  });

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
  const actor = extractActor(req);

  publishAuditEvent({
    hospitalId: appointment.hospitalId,
    entityType: 'APPOINTMENT',
    actionPerformed: 'Appointment Marked No-Show',
    actionType: 'WORKFLOW',
    performedByUserId: actor.userId,
    performedByRole: actor.userRole,
    userId: actor.userId,
    userRole: actor.userRole,
    previousValue: { status: appointment.status },
    newValue: { status: 'NO_SHOW' },
    statusChange: { from: appointment.status, to: 'NO_SHOW' },
    remarks: `Appointment ${id} marked as no-show`,
    path: `/appointments/${id}/no-show`,
    method: 'PATCH',
    metadata: { appointmentId: id },
  });

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

  const { search } = req.query;

  // 🔥 Bulk fetch doctor profiles
  const doctorProfiles = await fetchProfilesBulk(
    doctorIds,
    `${baseUrl}profiles/doctors/bulk`,
    authHeader,
    "doctor",
    search,
  );

  const result = doctors
    .map((doc) => ({
      doctorId: doc.doctorId,
      lastConsultedAt: doc.lastConsultedAt,
      profile: doctorProfiles[doc.doctorId] || null,
    }))
    .filter((entry) => (search ? entry.profile !== null : true));

  res.status(200).json({
    success: true,
    data: result,
  });
});

const getDoctorAppointmentStats = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;

  if (!doctorId) {
    throw new ApiError(400, "Doctor ID is required");
  }

  const stats = await appointmentService.getDoctorStats(doctorId);

  res.status(200).json({
    success: true,
    data: stats,
  });
});

const applyPaymentOutcome = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { outcome } = req.body;
  if (!["PAID", "FAILED"].includes(outcome)) {
    throw ApiError.badRequest('outcome must be "PAID" or "FAILED"');
  }
  const appointment = await appointmentService.applyPaymentOutcome(id, outcome);
  res.status(200).json({ success: true, data: appointment });
});

module.exports = {
  getAllAppointments,
  getAppointmentById,
  getDoctorAppointmentStats,
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
  applyPaymentOutcome,
};
