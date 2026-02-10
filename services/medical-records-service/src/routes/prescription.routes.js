const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/prescription.controller');
const {
  createPrescriptionSchema,
  updatePrescriptionSchema
} = require('../validations/prescription.validation');
const validate = require('../middleware/validation');

/**
 * @swagger
 * /api/prescriptions:
 *   post:
 *     summary: Create a new prescription
 *     tags: [Prescriptions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - doctorId
 *               - rxId
 *             properties:
 *               patientId:
 *                 type: string
 *                 format: uuid
 *               doctorId:
 *                 type: string
 *                 format: uuid
 *               rxId:
 *                 type: string
 *                 description: Format RX-YYYY-MMDD-XXX
 *               appointmentId:
 *                 type: string
 *                 format: uuid
 *               consultationId:
 *                 type: string
 *                 format: uuid
 *               diagnosis:
 *                 type: string
 *               medications:
 *                 type: array
 *               precautions:
 *                 type: array
 *               dietRecommendations:
 *                 type: array
 *     responses:
 *       201:
 *         description: Prescription created
 *       400:
 *         description: Validation error
 */
router.post('/', validate(createPrescriptionSchema), createPrescription);

/**
 * @swagger
 * /api/prescriptions/rx/{rxId}:
 *   get:
 *     summary: Get prescription by RX ID
 *     tags: [Prescriptions]
 *     parameters:
 *       - in: path
 *         name: rxId
 *         required: true
 *         schema:
 *           type: string
 *         description: e.g. RX-2025-0209-001
 *     responses:
 *       200:
 *         description: Prescription found
 *       404:
 *         description: Prescription not found
 */
router.get('/rx/:rxId', getPrescriptionByRxId);

/**
 * @swagger
 * /api/prescriptions/patient/{patientId}:
 *   get:
 *     summary: Get all prescriptions for a patient
 *     tags: [Prescriptions]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of prescriptions
 */
router.get('/patient/:patientId', getPrescriptionsByPatient);

/**
 * @swagger
 * /api/prescriptions/doctor/{doctorId}:
 *   get:
 *     summary: Get all prescriptions by a doctor
 *     tags: [Prescriptions]
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of prescriptions
 */
router.get('/doctor/:doctorId', getPrescriptionsByDoctor);

/**
 * @swagger
 * /api/prescriptions/{id}:
 *   get:
 *     summary: Get prescription by ID
 *     tags: [Prescriptions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Prescription found
 *       404:
 *         description: Prescription not found
 */
router.get('/:id', getPrescriptionById);

/**
 * @swagger
 * /api/prescriptions/{id}:
 *   put:
 *     summary: Update prescription
 *     tags: [Prescriptions]
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
 *               diagnosis:
 *                 type: string
 *               medications:
 *                 type: array
 *               precautions:
 *                 type: array
 *               dietRecommendations:
 *                 type: array
 *     responses:
 *       200:
 *         description: Prescription updated
 *       404:
 *         description: Prescription not found
 */
router.put('/:id', validate(updatePrescriptionSchema), updatePrescription);

/**
 * @swagger
 * /api/prescriptions/{id}/sign:
 *   post:
 *     summary: Sign prescription
 *     tags: [Prescriptions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Prescription signed
 *       404:
 *         description: Prescription not found
 */
router.post('/:id/sign', signPrescription);

/**
 * @swagger
 * /api/prescriptions/{id}/send:
 *   post:
 *     summary: Send prescription to patient
 *     tags: [Prescriptions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Prescription sent
 *       404:
 *         description: Prescription not found
 */
router.post('/:id/send', sendPrescription);

/**
 * @swagger
 * /api/prescriptions/{id}/view:
 *   post:
 *     summary: Mark prescription as viewed by patient
 *     tags: [Prescriptions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Marked as viewed
 *       404:
 *         description: Prescription not found
 */
router.post('/:id/view', markPrescriptionAsViewed);

/**
 * @swagger
 * /api/prescriptions/{id}:
 *   delete:
 *     summary: Delete prescription
 *     tags: [Prescriptions]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Prescription deleted
 *       404:
 *         description: Prescription not found
 */
router.delete('/:id', deletePrescription);

module.exports = router;
