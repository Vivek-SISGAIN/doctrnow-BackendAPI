const express = require('express');
const router = express.Router();
const {
  createConsultation,
  getConsultationById,
  getConsultationByAppointment,
  joinLobby,
  requestConsent,
  acceptConsent,
  startConsultation,
  endConsultation,
  endByAppointment,
  getHistoryByPatient,
  getHistoryByDoctor,
  updateConsultation,
  markNoShow,
  saveHealthDetails,
  getHealthDetails,
  broadcastExtension,
  submitReview,
  getDoctorRating,
  getConsultationReviews,
} = require('../controllers/consultation.controller');
const {
  createConsultationSchema,
  joinLobbySchema,
  saveHealthDetailsSchema,
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
 * /api/consultations/appointment/{appointmentId}/join-lobby:
 *   post:
 *     summary: Patient joins virtual lobby (get-or-create consultation, set patientJoinedAt)
 *     tags: [Consultations]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, doctorId]
 *             properties:
 *               patientId: { type: string, format: uuid }
 *               doctorId: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Joined lobby; data includes consultation and channelName for Agora
 */
router.post('/appointment/:appointmentId/join-lobby', validate(joinLobbySchema), joinLobby);

/**
 * @swagger
 * /api/consultations/appointment/{appointmentId}/health-details:
 *   post:
 *     summary: Save patient health details for appointment/consultation (post-payment or before call)
 *     tags: [Consultations]
 *     parameters:
 *       - in: path
 *         name: appointmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [patientId, doctorId]
 *             properties:
 *               patientId: { type: string, format: uuid }
 *               doctorId: { type: string, format: uuid }
 *               weight: { type: string }
 *               height: { type: string }
 *               bloodPressure: { type: string }
 *               sugarLevel: { type: string }
 *               consultationReason: { type: string }
 *     responses:
 *       200:
 *         description: Health details saved
 */
router.post('/appointment/:appointmentId/health-details', validate(saveHealthDetailsSchema), saveHealthDetails);

/**
 * @swagger
 * /api/consultations/appointment/{appointmentId}/health-details:
 *   get:
 *     summary: Get health details for appointment's consultation
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
 *         description: Health details (or null if none)
 */
router.get('/appointment/:appointmentId/health-details', getHealthDetails);

/**
 * @swagger
 * /api/consultations/appointment/{appointmentId}/request-consent:
 *   post:
 *     summary: Doctor requests consent from patient
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
 *         description: Consent requested
 */
router.post('/appointment/:appointmentId/request-consent', requestConsent);
router.post('/appointment/:appointmentId/broadcast-extension', broadcastExtension);

/**
 * @swagger
 * /api/consultations/appointment/{appointmentId}/accept-consent:
 *   post:
 *     summary: Patient accepts consent
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
 *         description: Consent accepted
 */
router.post('/appointment/:appointmentId/accept-consent', acceptConsent);

/**
 * @swagger
 * /api/consultations/appointment/{appointmentId}/end:
 *   post:
 *     summary: End consultation by appointment (doctor or patient ends call)
 *     tags: [Consultations]
 *     parameters:
 *       - in: path
 *         name: appointmentId
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
 *               endedBy: { type: string, enum: [doctor, patient] }
 *     responses:
 *       200:
 *         description: Consultation ended
 */
router.post('/appointment/:appointmentId/end', endByAppointment);

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
 * /api/consultations/{id}/review:
 *   patch:
 *     summary: Patient submits a review for a completed consultation
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
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string }
 *               isAnonymous: { type: boolean }
 *     responses:
 *       200:
 *         description: Review submitted
 *       400:
 *         description: Validation error or not completed
 *       403:
 *         description: Not authorized
 *       409:
 *         description: Already reviewed
 */
router.patch('/:id/review', submitReview);

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

/**
 * @swagger
 * /api/consultations/doctors/{doctorId}/rating:
 *   get:
 *     summary: Get doctor's average rating and breakdown
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
 *         description: Doctor rating stats retrieved successfully
 */
router.get('/doctors/:doctorId/rating', getDoctorRating);

/**
 * @swagger
 * /api/consultations/doctors/{doctorId}/reviews:
 *   get:
 *     summary: Get paginated reviews for a doctor
 *     tags: [Consultations]
 *     parameters:
 *       - in: path
 *         name: doctorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Doctor reviews retrieved successfully
 */
router.get('/doctors/:doctorId/reviews', getConsultationReviews);

module.exports = router;
