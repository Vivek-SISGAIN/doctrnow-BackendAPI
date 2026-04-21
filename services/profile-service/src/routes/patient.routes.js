const express = require('express');
const router = express.Router();
const {
  getAllPatients,
  getPatientById,
  getCurrentPatient,
  createCurrentPatient,
  updatePatient,
  deletePatient,
  getPatientsByBulkIds,
  updatePatientStatus
  // getPatientsByBulkIds
} = require('../controllers/patient.controller');
const { createPatientSchema } = require('../validations/patient.validation');
const validate = require('../middleware/validation');

/**
 * @swagger
 * /api/patients:
 *   get:
 *     summary: Get all patients with filtering and pagination
 *     tags: [Patients]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, phone, or MRN
 *       - in: query
 *         name: gender
 *         schema:
 *           type: string
 *           enum: [MALE, FEMALE, OTHER]
 *         description: Filter by gender
 *       - in: query
 *         name: bloodGroup
 *         schema:
 *           type: string
 *         description: Filter by blood group
 *       - in: query
 *         name: riskCategory
 *         schema:
 *           type: string
 *           enum: [HIGH, MEDIUM, LOW]
 *         description: Filter by risk category
 *       - in: query
 *         name: patientType
 *         schema:
 *           type: string
 *           enum: [CHRONIC, ACUTE]
 *         description: Filter by patient type
 *       - in: query
 *         name: followUpStatus
 *         schema:
 *           type: string
 *           enum: [SCHEDULED, OVERDUE, NO_FOLLOWUP]
 *         description: Filter by follow-up status
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
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [recent, name, visits, risk-high, risk-low]
 *           default: recent
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of patients
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Patient'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 */
router.get('/', getAllPatients);

/**
 * @swagger
 * /api/patients/me:
 *   get:
 *     summary: Get current patient profile (by X-User-ID from gateway)
 *     tags: [Patients]
 *     responses:
 *       200:
 *         description: Current patient profile
 *       404:
 *         description: Patient profile not found
 */
router.get('/me', getCurrentPatient);

/**
 * @swagger
 * /api/patients/me:
 *   post:
 *     summary: Create patient profile for current user (after registration)
 *     tags: [Patients]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, firstName, lastName, dateOfBirth, gender, emiratesId, nationality]
 *             properties:
 *               email: { type: string }
 *               mobileNumber: { type: string }
 *               firstName: { type: string }
 *               lastName: { type: string }
 *               dateOfBirth: { type: string, format: date }
 *               gender: { type: string, enum: [MALE, FEMALE, OTHER] }
 *               emiratesId: { type: string }
 *               nationality: { type: string }
 *               bloodGroup: { type: string }
 *               maritalStatus: { type: string }
 *     responses:
 *       201:
 *         description: Patient profile created
 *       409:
 *         description: Email/Mobile/Emirates ID already in use
 */
router.post('/me', validate(createPatientSchema), createCurrentPatient);

/**
 * @swagger
 * /api/patients/{id}:
 *   get:
 *     summary: Get patient by ID
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: Patient found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Patient'
 *       404:
 *         description: Patient not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/:id', getPatientById);

/**
 * @swagger
 * /api/patients/{id}:
 *   patch:
 *     summary: Update patient by ID
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Patient ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               mobileNumber:
 *                 type: string
 *               email:
 *                 type: string
 *               bloodGroup:
 *                 type: string
 *                 enum: [A_POS, A_NEG, B_POS, B_NEG, AB_POS, AB_NEG, O_POS, O_NEG]
 *               maritalStatus:
 *                 type: string
 *                 enum: [SINGLE, MARRIED, DIVORCED, WIDOWED]
 *     responses:
 *       200:
 *         description: Patient updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Patient updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Patient'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Patient not found
 */
router.patch('/:id', updatePatient);

/**
 * @swagger
 * /api/patients/{id}:
 *   delete:
 *     summary: Delete patient by ID
 *     tags: [Patients]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Patient ID
 *     responses:
 *       200:
 *         description: Patient deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Patient deleted successfully
 *       404:
 *         description: Patient not found
 */
router.delete('/:id', deletePatient);

router.post('/bulk', getPatientsByBulkIds);

router.patch('/:id/status', updatePatientStatus);

module.exports = router;
