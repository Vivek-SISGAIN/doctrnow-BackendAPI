const express = require('express');
const router = express.Router();
const {
  upsertVitals,
  getVitalsByConsultation,
  deleteVitals
} = require('../controllers/consultation-vitals.controller');
const {
  createVitalsSchema
} = require('../validations/consultation.validation');
const validate = require('../middleware/validation');

/**
 * @swagger
 * /api/consultation-vitals:
 *   post:
 *     summary: Create or update consultation vitals
 *     tags: [Consultation Vitals]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - consultationId
 *             properties:
 *               consultationId:
 *                 type: string
 *                 format: uuid
 *               bloodPressure:
 *                 type: string
 *               pulse:
 *                 type: string
 *               temperature:
 *                 type: string
 *               spo2:
 *                 type: string
 *               weight:
 *                 type: string
 *               height:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Vitals saved or updated
 *       400:
 *         description: Validation error
 */
router.post('/', validate(createVitalsSchema), upsertVitals);

/**
 * @swagger
 * /api/consultation-vitals/consultation/{consultationId}:
 *   get:
 *     summary: Get vitals for a consultation
 *     tags: [Consultation Vitals]
 *     parameters:
 *       - in: path
 *         name: consultationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Vitals for the consultation
 *       404:
 *         description: Vitals not found
 */
router.get('/consultation/:consultationId', getVitalsByConsultation);

/**
 * @swagger
 * /api/consultation-vitals/consultation/{consultationId}:
 *   delete:
 *     summary: Delete vitals for a consultation
 *     tags: [Consultation Vitals]
 *     parameters:
 *       - in: path
 *         name: consultationId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Vitals deleted
 *       404:
 *         description: Vitals not found
 */
router.delete('/consultation/:consultationId', deleteVitals);

module.exports = router;
