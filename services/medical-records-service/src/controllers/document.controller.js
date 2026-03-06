const documentService = require('../service/document.service');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const createDocument = asyncHandler(async (req, res) => {
  try {
    const document = await documentService.create(req.body);
    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: document
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const getDocumentById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const document = await documentService.findById(id);

  if (!document) {
    throw ApiError.notFound('Document not found');
  }

  res.status(200).json({
    success: true,
    data: document
  });
});

const getDocumentsByPatient = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const { type, page, limit } = req.query;

  const result = await documentService.findByPatientId(patientId, {
    type,
    page,
    limit
  });

  res.status(200).json({
    success: true,
    data: result.documents,
    pagination: result.pagination
  });
});

const getDocumentsByDoctor = asyncHandler(async (req, res) => {
  const { doctorId } = req.params;
  const { type, page, limit } = req.query;

  const result = await documentService.findByDoctorId(doctorId, {
    type,
    page,
    limit
  });

  res.status(200).json({
    success: true,
    data: result.documents,
    pagination: result.pagination
  });
});

const getDocumentsByAppointment = asyncHandler(async (req, res) => {
  const { appointmentId } = req.params;
  const documents = await documentService.findByAppointmentId(appointmentId);

  res.status(200).json({
    success: true,
    data: documents
  });
});

const getDocumentsByConsultation = asyncHandler(async (req, res) => {
  const { consultationId } = req.params;
  const documents = await documentService.findByConsultationId(consultationId);

  res.status(200).json({
    success: true,
    data: documents
  });
});

const updateDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const document = await documentService.findById(id);
  if (!document) {
    throw ApiError.notFound('Document not found');
  }

  try {
    const updated = await documentService.update(id, req.body);
    res.status(200).json({
      success: true,
      message: 'Document updated successfully',
      data: updated
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

const deleteDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const document = await documentService.findById(id);
  if (!document) {
    throw ApiError.notFound('Document not found');
  }

  try {
    await documentService.delete(id);
    res.status(200).json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    throw ApiError.badRequest(error.message);
  }
});

module.exports = {
  createDocument,
  getDocumentById,
  getDocumentsByPatient,
  getDocumentsByDoctor,
  getDocumentsByAppointment,
  getDocumentsByConsultation,
  updateDocument,
  deleteDocument
};
