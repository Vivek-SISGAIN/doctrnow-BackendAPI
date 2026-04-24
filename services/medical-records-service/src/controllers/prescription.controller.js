const prescriptionService = require('../service/prescription.service');
const s3Service = require('../service/s3.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const API_GATEWAY_URL = process.env.API_GATEWAY_URL || 'http://localhost:8080/api/v1';

async function fetchBulk(ids, bulkUrl, authHeader) {
  if (!ids || ids.length === 0) return {};
  try {
    const response = await fetch(bulkUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({ ids }),
    });

    if (!response.ok) {
      console.error(`[Medical-Records] Bulk fetch failed: ${response.status} from ${bulkUrl}`);
      return {};
    }

    const json = await response.json();
    console.log(`[Medical-Records] Bulk fetch SUCCESS from ${bulkUrl} - items: ${Object.keys(json.data || {}).length}`);
    return json.data || {};
  } catch (err) {
    console.error(`[Medical-Records] Bulk fetch error for ${bulkUrl}:`, err.message);
    return {};
  }
}

const createPrescription = asyncHandler(async (req, res) => {
  try {
    const prescription = await prescriptionService.create(req.body);
    res.status(201).json({
      success: true,
      message: 'Prescription created successfully',
      data: prescription
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const getPrescriptionById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const prescription = await prescriptionService.findById(id);

  if (!prescription) {
    throw ApiError.notFound('Prescription not found');
  }

  // Aggregation
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const consultationLookupIds = [prescription.consultationId, prescription.appointmentId].filter(Boolean);

    // 1. Fetch Doctor, Patient, and Consultations
    const [doctorMapRaw, patientMapRaw, consultationMapRaw] = await Promise.all([
      fetchBulk([prescription.doctorId], `${API_GATEWAY_URL}/profiles/doctors/bulk`, authHeader),
      fetchBulk([prescription.patientId], `${API_GATEWAY_URL}/profiles/patients/bulk`, authHeader),
      fetchBulk(consultationLookupIds, `${API_GATEWAY_URL}/consultations/bulk`, authHeader)
    ]);

    // Robust mapping
    const doctor = Object.values(doctorMapRaw).find(d => d.id === prescription.doctorId || d.userId === prescription.doctorId) || null;
    prescription.doctor = doctor;
    prescription.patient = Object.values(patientMapRaw).find(p => p.id === prescription.patientId || p.userId === prescription.patientId) || null;
    prescription.consultation = consultationMapRaw[prescription.consultationId] || consultationMapRaw[prescription.appointmentId] || null;

    // 2. Fetch Hospital if doctor found
    if (doctor && doctor.hospitalId) {
      const hospitalMap = await fetchBulk([doctor.hospitalId], `${API_GATEWAY_URL}/super-admins/hospital/bulk`, authHeader);
      prescription.hospital = hospitalMap[doctor.hospitalId] || null;
    } else {
      prescription.hospital = null;
    }
  }

  res.status(200).json({
    success: true,
    data: prescription
  });
});

const getPrescriptionByRxId = asyncHandler(async (req, res) => {
  const { rxId } = req.params;
  const prescription = await prescriptionService.findByRxId(rxId);

  if (!prescription) {
    throw ApiError.notFound('Prescription not found');
  }

  res.status(200).json({
    success: true,
    data: prescription
  });
});

const getPrescriptionsByPatient = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const { lifecycle, page, limit, search, startDate, endDate } = req.query;

  const result = await prescriptionService.findByPatientId(patientId, {
    lifecycle,
    page,
    limit,
    search,
    startDate,
    endDate
  });

  const prescriptions = result.prescriptions;
  const authHeader = req.headers.authorization;

  console.log(`[Medical-Records] Patient ${patientId}: found ${prescriptions.length} prescriptions. Auth header: ${authHeader ? 'PRESENT' : 'MISSING'}`);

  if (prescriptions.length > 0 && authHeader) {
    const doctorIds = [...new Set(prescriptions.map(p => p.doctorId))];
    const patientIds = [...new Set(prescriptions.map(p => p.patientId))];
    const consultationIds = [...new Set(prescriptions.map(p => p.consultationId).filter(Boolean))];
    const appointmentIds = [...new Set(prescriptions.map(p => p.appointmentId).filter(Boolean))];

    // Combine consultation and appointment IDs for bulk lookup
    const allConsultationLookupIds = [...new Set([...consultationIds, ...appointmentIds])];

    // Bulk fetch Doctor, Patient, and Consultations
    const [doctorMapRaw, patientMapRaw, consultationMapRaw] = await Promise.all([
      fetchBulk(doctorIds, `${API_GATEWAY_URL}/profiles/doctors/bulk`, authHeader),
      fetchBulk(patientIds, `${API_GATEWAY_URL}/profiles/patients/bulk`, authHeader),
      fetchBulk(allConsultationLookupIds, `${API_GATEWAY_URL}/consultations/bulk`, authHeader)
    ]);

    // Robust ID mapping: create maps that look up by both .id and .userId
    const doctorMap = {};
    Object.values(doctorMapRaw).forEach(d => {
      if (d.id) doctorMap[d.id] = d;
      if (d.userId) doctorMap[d.userId] = d;
    });

    const patientMap = {};
    Object.values(patientMapRaw).forEach(p => {
      if (p.id) patientMap[p.id] = p;
      if (p.userId) patientMap[p.userId] = p;
    });

    const consultationMap = consultationMapRaw; // consultationMapRaw is already keyed by both id and appointmentId

    // Extract Hospital IDs from doctor profiles
    const hospitalIds = [...new Set(Object.values(doctorMap).map(d => d.hospitalId).filter(Boolean))];
    const hospitalMap = hospitalIds.length > 0 
      ? await fetchBulk(hospitalIds, `${API_GATEWAY_URL}/super-admins/hospital/bulk`, authHeader)
      : {};

    // Merge everything
    for (const rx of prescriptions) {
      const doc = doctorMap[rx.doctorId] || null;
      rx.doctor = doc;
      rx.patient = patientMap[rx.patientId] || null;
      rx.hospital = doc && doc.hospitalId ? (hospitalMap[doc.hospitalId] || null) : null;
      
      // Try lookup consultation by id or appointmentId
      rx.consultation = consultationMap[rx.consultationId] || consultationMap[rx.appointmentId] || null;
    }
  }

  res.status(200).json({
    success: true,
    data: prescriptions,
    pagination: result.pagination
  });
});

const getPrescriptionCountByDoctor = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { lifecycle } = req.query;

  const count = await prescriptionService.countByDoctorId(doctorId, { lifecycle });

  res.status(200).json({
    success: true,
    data: { count }
  });
});

const getPrescriptionsByDoctor = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { lifecycle, page, limit } = req.query;

  const result = await prescriptionService.findByDoctorId(doctorId, {
    lifecycle,
    page,
    limit
  });

  res.status(200).json({
    success: true,
    data: result.prescriptions,
    pagination: result.pagination
  });
});

const updatePrescription = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const prescription = await prescriptionService.findById(id);
  if (!prescription) {
    throw ApiError.notFound('Prescription not found');
  }

  try {
    const updated = await prescriptionService.update(id, req.body);
    res.status(200).json({
      success: true,
      message: 'Prescription updated successfully',
      data: updated
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const signPrescription = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const prescription = await prescriptionService.sign(id);
    res.status(200).json({
      success: true,
      message: 'Prescription signed successfully',
      data: prescription
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const sendPrescription = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const prescription = await prescriptionService.send(id);
    res.status(200).json({
      success: true,
      message: 'Prescription sent successfully',
      data: prescription
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const markPrescriptionAsViewed = asyncHandler(async (req, res) => {
  const { id } = req.params;

  try {
    const prescription = await prescriptionService.markAsViewed(id);
    res.status(200).json({
      success: true,
      message: 'Prescription marked as viewed',
      data: prescription
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const deletePrescription = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const prescription = await prescriptionService.findById(id);
  if (!prescription) {
    throw ApiError.notFound('Prescription not found');
  }

  try {
    await prescriptionService.delete(id);
    res.status(200).json({
      success: true,
      message: 'Prescription deleted successfully'
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const getPrescriptionPdfUrl = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { action = 'view' } = req.query; // 'view' or 'download'

  console.log(`[PrescriptionController] Fetching PDF URL for Rx ID: ${id} (action: ${action})`);

  const prescription = await prescriptionService.findById(id);
  if (!prescription) {
    throw ApiError.notFound('Prescription not found');
  }

  if (!prescription.s3Key) {
    console.error(`[PrescriptionController] Prescription PDF has not been uploaded to S3 for: ${id}`);
    throw ApiError.notFound('Prescription PDF has not been generated or uploaded to S3 yet');
  }

  // Generate the pre-signed URL
  const url = await s3Service.getPresignedUrl(prescription.s3Key, action);
  console.log(`[PrescriptionController] Successfully returned ${action} URL for Rx ${id}`);

  res.status(200).json({
    success: true,
    data: {
      url,
      action
    }
  });
});

const getPrescriptionsBulkByAppointments = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    throw ApiError.badRequest('ids must be an array of appointment IDs');
  }

  const map = await prescriptionService.findByAppointmentIds(ids);

  res.status(200).json({
    success: true,
    data: map
  });
});

module.exports = {
  createPrescription,
  getPrescriptionById,
  getPrescriptionByRxId,
  getPrescriptionCountByDoctor,
  getPrescriptionsByPatient,
  getPrescriptionsByDoctor,
  updatePrescription,
  signPrescription,
  sendPrescription,
  markPrescriptionAsViewed,
  deletePrescription,
  getPrescriptionPdfUrl,
  getPrescriptionsBulkByAppointments
};
