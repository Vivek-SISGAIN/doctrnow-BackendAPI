const express = require('express');
const router = express.Router();
const {
  createDocument,
  getDocumentById,
  getDocumentsByPatient,
  getDocumentsByDoctor,
  getDocumentsByAppointment,
  getDocumentsByConsultation,
  updateDocument,
  deleteDocument,
  // New
  getUploadUrl,
  deleteTempFile,
  confirmUpload,
  getDocumentsByAppointmentsBulk,
  getDocumentsByConsultationsBulk,
  getDocumentUrl,
} = require('../controllers/document.controller');
const {
  createDocumentSchema,
  updateDocumentSchema
} = require('../validations/document.validation');
const validate = require('../middleware/validation');

// ─── New: Upload lifecycle routes ─────────────────────────────────────────────

/**
 * GET /api/documents/upload-url
 * Returns a presigned S3 PUT URL for direct browser upload (stages in temp/).
 * Query: patientId, fileName, mimeType, fileSize (bytes, optional for pre-check)
 */
router.get('/upload-url', getUploadUrl);

/**
 * DELETE /api/documents/temp-file
 * Clean up a discarded staged upload from S3 temp/ prefix.
 * Body: { s3Key }
 */
router.delete('/temp-file', deleteTempFile);

/**
 * POST /api/documents/confirm-upload
 * Moves the uploaded file from temp/ to documents/, saves metadata in DB.
 */
router.post('/confirm-upload', confirmUpload);

// ─── New: Internal bulk endpoints (protected by x-internal-secret) ────────────

/**
 * POST /api/documents/appointments/bulk
 * Internal: returns { appointmentId: Document[] } map.
 * Requires x-internal-secret header.
 */
router.post('/appointments/bulk', ...getDocumentsByAppointmentsBulk);

/**
 * POST /api/documents/consultations/bulk
 * Internal: returns { consultationId: Document[] } map.
 * Requires x-internal-secret header.
 */
router.post('/consultations/bulk', ...getDocumentsByConsultationsBulk);

// ─── Existing routes ──────────────────────────────────────────────────────────

router.post('/', validate(createDocumentSchema), createDocument);

router.get('/patient/:patientId', getDocumentsByPatient);

router.get('/doctor/:doctorId', getDocumentsByDoctor);

router.get('/appointment/:appointmentId', getDocumentsByAppointment);

router.get('/consultation/:consultationId', getDocumentsByConsultation);
router.get('/:id', getDocumentById);

router.get('/:id/url', getDocumentUrl);

router.put('/:id', validate(updateDocumentSchema), updateDocument);

router.delete('/:id', deleteDocument);

module.exports = router;
