const express = require('express');
const router = express.Router();
const {
  createConsultation,
  getConsultationById,
  getConsultationByAppointment,
  startConsultation,
  endConsultation,
  getHistoryByPatient,
  getHistoryByDoctor,
  updateConsultation,
  markNoShow
} = require('../controllers/consultation.controller');
const {
  createConsultationSchema,
  updateConsultationSchema
} = require('../validations/consultation.validation');
const validate = require('../middleware/validation');

/**
 * @swagger
 * /api/consultations:
 *   post:
 *     summary: Create a new consultation
 *     tags: [Consultations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appointmentId
 *               - patientId
 *               - doctorId
 *             properties:
 *               appointmentId:
 *                 type: string
 *                 format: uuid
 *               patientId:
 *                 type: string
 *                 format: uuid
 *               doctorId:
 *                 type: string
 *                 format: uuid
 *               status:
 *                 type: string
 *                 enum: [PENDING, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW]
 *               type:
 *                 type: string
 *                 enum: [VIDEO, AUDIO, CHAT]
 *               diagnosis:
 *                 type: string
 *               followUp:
 *                 type: string
 *     responses:
 *       201:
 *         description: Consultation created
 *       400:
 *         description: Validation error
 */
router.post('/', validate(createConsultationSchema), createConsultation);

/**
 * @swagger
 * /api/consultations/history/patient/{patientId}:
 *   get:
 *     summary: Get consultation history by patient ID
 *     tags: [Consultations]
 *     parameters:
 *       - in: path
 *         name: patientId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of consultations for patient
 */
router.get('/history/patient/:patientId', getHistoryByPatient);

/**
 * @swagger
 * /api/consultations/history/doctor/{doctorId}:
 *   get:
 *     summary: Get consultation history by doctor ID
 *     tags: [Consultations]
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of consultations for doctor
 */
router.get('/history/doctor/:doctorId', getHistoryByDoctor);

/**
 * @swagger
 * /api/consultations/appointment/{appointmentId}:
 *   get:
 *     summary: Get consultation by appointment ID
 *     tags: [Consultations]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Consultation found
 *       404:
 *         description: Consultation not found
 */
router.get('/appointment/:appointmentId', getConsultationByAppointment);

/**
 * @swagger
 * /api/consultations/appointment/{appointmentId}/start:
 *   post:
 *     summary: Start a consultation
 *     tags: [Consultations]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Consultation started
 *       404:
 *         description: Appointment or consultation not found
 */
router.post('/appointment/:appointmentId/start', startConsultation);

/**
 * @swagger
 * /api/consultations/{id}:
 *   get:
 *     summary: Get consultation by ID
 *     tags: [Consultations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Consultation found
 *       404:
 *         description: Consultation not found
 */
router.get('/:id', getConsultationById);

/**
 * @swagger
 * /api/consultations/{id}/end:
 *   post:
 *     summary: End a consultation
 *     tags: [Consultations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Consultation ended
 *       404:
 *         description: Consultation not found
 */
router.post('/:id/end', endConsultation);

/**
 * @swagger
 * /api/consultations/{id}:
 *   put:
 *     summary: Update consultation
 *     tags: [Consultations]
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
 *               status:
 *                 type: string
 *                 enum: [PENDING, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW]
 *               diagnosis:
 *                 type: string
 *               followUp:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [VIDEO, AUDIO, CHAT]
 *     responses:
 *       200:
 *         description: Consultation updated
 *       404:
 *         description: Consultation not found
 */
router.put('/:id', validate(updateConsultationSchema), updateConsultation);

/**
 * @swagger
 * /api/consultations/{id}/no-show:
 *   post:
 *     summary: Mark consultation as no-show
 *     tags: [Consultations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Marked as no-show
 *       404:
 *         description: Consultation not found
 */
router.post('/:id/no-show', markNoShow);

module.exports = router;
