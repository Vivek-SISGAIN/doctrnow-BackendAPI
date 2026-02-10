const prescriptionService = require('../service/prescription.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

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
  const { lifecycle, page, limit } = req.query;

  const result = await prescriptionService.findByPatientId(patientId, {
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

module.exports = {
  createPrescription,
  getPrescriptionById,
  getPrescriptionByRxId,
  getPrescriptionsByPatient,
  getPrescriptionsByDoctor,
  updatePrescription,
  signPrescription,
  sendPrescription,
  markPrescriptionAsViewed,
  deletePrescription
};
