const express = require("express");
const router = express.Router();
const {
  getAllAppointments,
  getAppointmentById,
  getDoctorAppointmentStats,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  rescheduleAppointment,
  confirmAppointment,
  completeAppointment,
  markMissedAsNoShow,
  markNoShow,
  extendAppointment,
  getAllAppointmentsV1,
  getHospitalPatients,
  getPreviouslyConsultedDoctors,
  applyPaymentOutcome,
} = require("../controllers/appointment.controller");
const {
  createAppointmentSchema,
  updateAppointmentSchema,
  rescheduleAppointmentSchema,
  cancelAppointmentSchema,
} = require("../validations/appointment.validation");
const validate = require("../middleware/validation");
const { internalAuth } = require("../middleware/internalAuth");

/**
 * Internal route for payment-insurance-service's Stripe webhook handler.
 * Must be registered before /:id to avoid router shadowing.
 */
router.patch("/internal/:id/payment-outcome", internalAuth, applyPaymentOutcome);

/**
 * @swagger
 * /api/appointments:
 *   get:
 *     summary: Get all appointments with filtering and pagination
 *     tags: [Appointments]
 *     parameters:
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by patient ID
 *       - in: query
 *         name: doctorId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by doctor ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW]
 *         description: Filter by appointment status
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [PENDING, PAID, FAILED, REFUNDED]
 *         description: Filter by payment status
 *       - in: query
 *         name: consultationType
 *         schema:
 *           type: string
 *           enum: [VIDEO, AUDIO, CHAT]
 *         description: Filter by consultation type
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter appointments from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter appointments until this date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of appointments
 */
router.get("/", getAllAppointments);
// router.get('/v123', getAllAppointmentsV1); // New version with improved filtering and pagination

/** GET /api/appointments/stats/doctor/:doctorId */
router.get("/stats/doctor/:doctorId", getDoctorAppointmentStats);

/** POST /api/appointments/mark-missed-no-shows - must be before /:id to avoid matching as id */
router.post("/mark-missed-no-shows", markMissedAsNoShow);

/**
 * @swagger
 * /api/appointments/{id}:
 *   get:
 *     summary: Get appointment by ID
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Appointment ID
 *     responses:
 *       200:
 *         description: Appointment found
 *       404:
 *         description: Appointment not found
 */
router.get("/:id", getAppointmentById);

/**
 * @swagger
 * /api/appointments:
 *   post:
 *     summary: Create a new appointment
 *     tags: [Appointments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - doctorId
 *               - slotId
 *             properties:
 *               patientId:
 *                 type: string
 *                 format: uuid
 *               doctorId:
 *                 type: string
 *                 format: uuid
 *               slotId:
 *                 type: string
 *                 format: uuid
 *               consultationType:
 *                 type: string
 *                 enum: [VIDEO, AUDIO, CHAT]
 *               reason:
 *                 type: string
 *               notes:
 *                 type: string
 *               familyMemberId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Appointment created successfully
 *       400:
 *         description: Validation error
 */
router.post("/", validate(createAppointmentSchema), createAppointment);

/**
 * @swagger
 * /api/appointments/{id}:
 *   patch:
 *     summary: Update appointment
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: id
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
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW]
 *               paymentStatus:
 *                 type: string
 *                 enum: [PENDING, PAID, FAILED, REFUNDED]
 *               consultationType:
 *                 type: string
 *                 enum: [VIDEO, AUDIO, CHAT]
 *               reason:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Appointment updated successfully
 */
router.patch("/:id", validate(updateAppointmentSchema), updateAppointment);

/**
 * @swagger
 * /api/appointments/{id}/cancel:
 *   post:
 *     summary: Cancel appointment
 *     tags: [Appointments]
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
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Appointment cancelled successfully
 */
router.post(
  "/:id/cancel",
  validate(cancelAppointmentSchema),
  cancelAppointment,
);

/**
 * @swagger
 * /api/appointments/{id}/reschedule:
 *   post:
 *     summary: Reschedule appointment
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: id
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
 *             required:
 *               - newSlotId
 *             properties:
 *               newSlotId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Appointment rescheduled successfully
 */
router.post(
  "/:id/reschedule",
  validate(rescheduleAppointmentSchema),
  rescheduleAppointment,
);

/**
 * @swagger
 * /api/appointments/{id}/confirm:
 *   post:
 *     summary: Confirm appointment
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Appointment confirmed successfully
 */
router.post("/:id/confirm", confirmAppointment);

/**
 * @swagger
 * /api/appointments/{id}/extend:
 *   post:
 *     summary: Extend appointment
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Appointment extended successfully
 */
router.post("/:id/extend", extendAppointment);

/**
 * @swagger
 * /api/appointments/{id}/complete:
 *   post:
 *     summary: Mark appointment as completed
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Appointment marked as completed
 */
router.post("/:id/complete", completeAppointment);

/**
 * @swagger
 * /api/appointments/mark-missed-no-shows:
 *   post:
 *     summary: Mark missed appointments as no-show (slot ended, status still CONFIRMED/PENDING)
 *     tags: [Appointments]
 *     parameters:
 *       - in: query
 *         name: doctorId
 *         schema: { type: string, format: uuid }
 *         description: Optional - only mark appointments for this doctor
 *     responses:
 *       200:
 *         description: Missed appointments marked as no-show
 */
router.post("/mark-missed-no-shows", markMissedAsNoShow);

/**
 * @swagger
 * /api/appointments/{id}/no-show:
 *   post:
 *     summary: Mark appointment as no-show
 *     tags: [Appointments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Appointment marked as no-show
 */
router.post("/:id/no-show", markNoShow);

router.get("/:hospitalId/hospitals", getHospitalPatients);
router.get(
  "/:patientId/previously-consulted-doctors",
  getPreviouslyConsultedDoctors,
);

module.exports = router;
