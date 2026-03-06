const express = require('express');
const router = express.Router();

const {
  getAllInsuranceProviders,
  getInsuranceProviderById,
  createInsuranceProvider,
  updateInsuranceProvider,
  deleteInsuranceProvider
} = require('../controllers/insuranceProvider.controller');

const {
  createInsuranceProviderSchema,
  updateInsuranceProviderSchema
} = require('../validations/insuranceProvider.validation');

const validate = require('../middleware/validation');

/**
 * @swagger
 * /api/insurance-providers/{id}:
 *   get:
 *     summary: Get insurance provider by ID
 *     tags: [Insurance Providers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Insurance Provider ID
 *     responses:
 *       200:
 *         description: Insurance Provider found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/InsuranceProvider'
 *       404:
 *         description: Insurance Provider not found
 */
router.get('/:id', getInsuranceProviderById);

/**
 * @swagger
 * /api/insurance-providers/{id}:
 *   patch:
 *     summary: Update insurance provider by ID
 *     tags: [Insurance Providers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Insurance Provider ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateInsuranceProvider'
 *     responses:
 *       200:
 *         description: Insurance Provider updated successfully
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
 *                   $ref: '#/components/schemas/InsuranceProvider'
 *       404:
 *         description: Insurance Provider not found
 *       409:
 *         description: Conflict – duplicate provider details
 */
router.patch('/:id', validate(updateInsuranceProviderSchema), updateInsuranceProvider);

/**
 * @swagger
 * /api/insurance-providers/{id}:
 *   delete:
 *     summary: Delete insurance provider by ID
 *     tags: [Insurance Providers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Insurance Provider ID
 *     responses:
 *       200:
 *         description: Insurance Provider deleted successfully
 *       404:
 *         description: Insurance Provider not found
 */
router.delete('/:id', deleteInsuranceProvider);

/**
 * @swagger
 * /api/insurance-providers:
 *   get:
 *     summary: Get all insurance providers
 *     tags: [Insurance Providers]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by provider name or email
 *       - in: query
 *         name: providerType
 *         schema:
 *           type: string
 *         description: INSURANCE / TPA
 *       - in: query
 *         name: networkType
 *         schema:
 *           type: string
 *         description: IN_NETWORK / OUT_NETWORK / BOTH
 *       - in: query
 *         name: supportedService
 *         schema:
 *           type: string
 *         description: Filter by supported service
 *     responses:
 *       200:
 *         description: List of insurance providers
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
 *                     $ref: '#/components/schemas/InsuranceProvider'
 */
router.get('/', getAllInsuranceProviders);

/**
 * @swagger
 * /api/insurance-providers:
 *   post:
 *     summary: Create a new insurance provider
 *     tags: [Insurance Providers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateInsuranceProvider'
 *     responses:
 *       201:
 *         description: Insurance Provider created successfully
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
 *                   $ref: '#/components/schemas/InsuranceProvider'
 *       409:
 *         description: Insurance Provider already exists
 */
router.post('/', validate(createInsuranceProviderSchema), createInsuranceProvider);

module.exports = router;
