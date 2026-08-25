const express = require('express');
const paymentController = require('../controllers/payment.controller');

const router = express.Router();

/**
 * @swagger
 * /api/payments:
 *   post:
 *     summary: Process a payment transaction
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [appointmentId, patientId, amount]
 *             properties:
 *               appointmentId:
 *                 type: string
 *               patientId:
 *                 type: string
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *                 default: AED
 *               paymentMethod:
 *                 type: string
 *                 default: CREDIT_CARD
 *     responses:
 *       201:
 *         description: Payment processed
 */
router.post('/', paymentController.processPayment);

/**
 * @swagger
 * /api/payments/{id}:
 *   get:
 *     summary: Get payment details by ID
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Payment details
 */
router.get('/:id', paymentController.getPaymentById);

/**
 * @swagger
 * /api/payments/{id}/refund:
 *   post:
 *     summary: Process a refund
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Refund initiated
 */
router.post('/:id/refund', paymentController.processRefund);

module.exports = router;
