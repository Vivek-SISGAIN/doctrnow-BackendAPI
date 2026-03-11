const express = require('express');
const router = express.Router();
const {
  getDoctorById,
  updateDoctor,
  deleteDoctor,
  searchDoctorsBySpecialization,
  createDoctor,
  getAllDoctors,
  getAvailability,
  setAvailability,
  getDoctorsByBulkIds,
  getDocByHospitalId
} = require('../controllers/doctor.controller');
const { updateDoctorSchema, createDoctorSchema } = require('../validations/doctor.validation');
const validate = require('../middleware/validation');

/**
 * @swagger
 * /api/doctors/search/specialization:
 *   get:
 *     summary: Search doctors by specialization
 *     tags: [Doctors]
 *     parameters:
 *       - in: query
 *         name: specialization
 *         schema:
 *           type: string
 *         description: Primary specialization to search for
 *       - in: query
 *         name: subSpecialization
 *         schema:
 *           type: string
 *         description: Sub specialization to filter by
 *     responses:
 *       200:
 *         description: List of doctors matching the specialization
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
 *                     $ref: '#/components/schemas/Doctor'
 */
router.get('/search/specialization', searchDoctorsBySpecialization);

/**
 * @swagger
 * /api/doctors/{id}/availability:
 *   get:
 *     summary: Get doctor availability status
 *     tags: [Doctors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Doctor ID or user ID
 *     responses:
 *       200:
 *         description: Availability status (ONLINE, OFFLINE, BUSY)
 *       404:
 *         description: Doctor not found
 */
router.get('/:id/availability', getAvailability);

/**
 * @swagger
 * /api/doctors/{id}/availability:
 *   patch:
 *     summary: Set doctor availability status
 *     tags: [Doctors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ONLINE, OFFLINE, BUSY]
 *     responses:
 *       200:
 *         description: Availability updated
 *       404:
 *         description: Doctor not found
 */
router.patch('/:id/availability', setAvailability);

/**
 * @swagger
 * /api/doctors/{id}:
 *   get:
 *     summary: Get doctor by ID
 *     tags: [Doctors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Doctor ID
 *     responses:
 *       200:
 *         description: Doctor found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Doctor'
 *       404:
 *         description: Doctor not found
 */
router.get('/:id', getDoctorById);

/**
 * @swagger
 * /api/doctors/{id}:
 *   patch:
 *     summary: Update doctor by ID
 *     tags: [Doctors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Doctor ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               email:
 *                 type: string
 *               professionalBio:
 *                 type: string
 *               workingDays:
 *                 type: array
 *                 items:
 *                   type: string
 *               workingHoursFrom:
 *                 type: string
 *               workingHoursTo:
 *                 type: string
 *               videoConsultationFee:
 *                 type: number
 *               phoneConsultationFee:
 *                 type: number
 *     responses:
 *       200:
 *         description: Doctor updated successfully
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
 *                 data:
 *                   $ref: '#/components/schemas/Doctor'
 *       404:
 *         description: Doctor not found
 */
router.patch('/:id', validate(updateDoctorSchema), updateDoctor);

/**
 * @swagger
 * /api/doctors/{id}:
 *   delete:
 *     summary: Delete doctor by ID
 *     tags: [Doctors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Doctor ID
 *     responses:
 *       200:
 *         description: Doctor deleted successfully
 *       404:
 *         description: Doctor not found
 */
router.delete('/:id', deleteDoctor);

/**
 * @swagger
 * /api/doctors:
 *   get:
 *     summary: Get all doctors
 *     tags: [Doctors]
 *     responses:
 *       200:
 *         description: List of all doctors
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
 *                     $ref: '#/components/schemas/Doctor'
 *       404:
 *         description: Doctor not found
 *       500:
 *         description: Internal server error
 */
router.get('/', getAllDoctors);

router.post('/', validate(createDoctorSchema), createDoctor);

router.post('/bulk', getDoctorsByBulkIds);

router.get('/hospital/:hospitalId', getDocByHospitalId);

module.exports = router;
