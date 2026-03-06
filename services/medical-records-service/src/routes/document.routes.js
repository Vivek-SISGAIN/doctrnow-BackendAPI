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
  deleteDocument
} = require('../controllers/document.controller');
const {
  createDocumentSchema,
  updateDocumentSchema
} = require('../validations/document.validation');
const validate = require('../middleware/validation');

/**
 * @swagger
 * /api/documents:
 *   post:
 *     summary: Upload a medical document
 *     tags: [Documents]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - name
 *               - type
 *               - uploadedBy
 *             properties:
 *               patientId:
 *                 type: string
 *                 format: uuid
 *               doctorId:
 *                 type: string
 *                 format: uuid
 *               appointmentId:
 *                 type: string
 *                 format: uuid
 *               consultationId:
 *                 type: string
 *                 format: uuid
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [LAB_REPORT, RADIOLOGY, PRESCRIPTION, CONSULTATION_NOTES, REFERRAL, OTHER]
 *               description:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Document uploaded
 *       400:
 *         description: Validation error
 */
router.post('/', validate(createDocumentSchema), createDocument);

/**
 * @swagger
 * /api/documents/patient/{patientId}:
 *   get:
 *     summary: Get all documents for a patient
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of documents
 */
router.get('/patient/:patientId', getDocumentsByPatient);

/**
 * @swagger
 * /api/documents/doctor/{doctorId}:
 *   get:
 *     summary: Get all documents by a doctor
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of documents
 */
router.get('/doctor/:doctorId', getDocumentsByDoctor);

/**
 * @swagger
 * /api/documents/appointment/{appointmentId}:
 *   get:
 *     summary: Get documents for an appointment
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of documents
 */
router.get('/appointment/:appointmentId', getDocumentsByAppointment);

/**
 * @swagger
 * /api/documents/consultation/{consultationId}:
 *   get:
 *     summary: Get documents for a consultation
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: consultationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of documents
 */
router.get('/consultation/:consultationId', getDocumentsByConsultation);

/**
 * @swagger
 * /api/documents/{id}:
 *   get:
 *     summary: Get document by ID
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Document found
 *       404:
 *         description: Document not found
 */
router.get('/:id', getDocumentById);

/**
 * @swagger
 * /api/documents/{id}:
 *   put:
 *     summary: Update document metadata
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Document updated
 *       404:
 *         description: Document not found
 */
router.put('/:id', validate(updateDocumentSchema), updateDocument);

/**
 * @swagger
 * /api/documents/{id}:
 *   delete:
 *     summary: Delete document
 *     tags: [Documents]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Document deleted
 *       404:
 *         description: Document not found
 */
router.delete('/:id', deleteDocument);

module.exports = router;
