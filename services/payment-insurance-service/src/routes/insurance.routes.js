const express = require('express');
const insuranceController = require('../controllers/insurance.controller');

const router = express.Router();

/**
 * @swagger
 * /api/insurance/coverage/{emiratesId}:
 *   get:
 *     summary: Check patient insurance coverage by Emirates ID
 *     tags: [Insurance]
 *     parameters:
 *       - in: path
 *         name: emiratesId
 *         required: true
 *         schema:
 *           type: string
 *         example: "784-1990-1234567-1"
 *     responses:
 *       200:
 *         description: Insurance coverage details
 */
router.get('/coverage/:emiratesId', insuranceController.checkCoverage);

/**
 * @swagger
 * /api/insurance/claims:
 *   post:
 *     summary: Submit an insurance claim
 *     tags: [Insurance]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [appointmentId, patientId, emiratesId]
 *             properties:
 *               appointmentId:
 *                 type: string
 *               patientId:
 *                 type: string
 *               emiratesId:
 *                 type: string
 *               insuranceProvider:
 *                 type: string
 *               totalAmount:
 *                 type: number
 *     responses:
 *       201:
 *         description: Claim submitted
 */
router.post('/claims', insuranceController.submitClaim);

/**
 * @swagger
 * /api/insurance/claims/{id}:
 *   get:
 *     summary: Get insurance claim status by ID
 *     tags: [Insurance]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Claim status details
 */
router.get('/claims/:id', insuranceController.getClaimById);

module.exports = router;
