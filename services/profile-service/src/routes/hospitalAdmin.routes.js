const express = require('express');
const router = express.Router();
const {

  getHospitalAdminById,
  getHospitalAdminsByHospital,
  updateHospitalAdmin,
  deleteHospitalAdmin
} = require('../controllers/hospitalAdmin.controller');
const {  updateHospitalAdminSchema } = require('../validations/hospitalAdmin.validation');
const validate = require('../middleware/validation');

/**
 * @swagger
 * /api/hospital-admins/hospital/{hospitalName}:
 *   get:
 *     summary: Get all hospital admins by hospital name
 *     tags: [Hospital Admins]
 *     parameters:
 *       - in: path
 *         name: hospitalName
 *         required: true
 *         schema:
 *           type: string
 *         description: Hospital name
 *     responses:
 *       200:
 *         description: List of hospital admins
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
 *                     $ref: '#/components/schemas/HospitalAdmin'
 */
router.get('/hospital/:hospitalName', getHospitalAdminsByHospital);

/**
 * @swagger
 * /api/hospital-admins/{id}:
 *   get:
 *     summary: Get hospital admin by ID
 *     tags: [Hospital Admins]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Hospital admin ID
 *     responses:
 *       200:
 *         description: Hospital admin found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/HospitalAdmin'
 *       404:
 *         description: Hospital admin not found
 */
router.get('/:id', getHospitalAdminById);

/**
 * @swagger
 * /api/hospital-admins/{id}:
 *   patch:
 *     summary: Update hospital admin by ID
 *     tags: [Hospital Admins]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Hospital admin ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               position:
 *                 type: string
 *               department:
 *                 type: string
 *     responses:
 *       200:
 *         description: Hospital admin updated successfully
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
 *                   $ref: '#/components/schemas/HospitalAdmin'
 *       404:
 *         description: Hospital admin not found
 */
router.patch('/:id', validate(updateHospitalAdminSchema), updateHospitalAdmin);

/**
 * @swagger
 * /api/hospital-admins/{id}:
 *   delete:
 *     summary: Delete hospital admin by ID
 *     tags: [Hospital Admins]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Hospital admin ID
 *     responses:
 *       200:
 *         description: Hospital admin deleted successfully
 *       404:
 *         description: Hospital admin not found
 */
router.delete('/:id', deleteHospitalAdmin);

module.exports = router;
