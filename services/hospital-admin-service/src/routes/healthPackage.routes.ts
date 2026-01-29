import { Router } from 'express';
import { asyncHandler } from '../utils';
import healthPackageController from '../controllers/healthPackage.controller';

const router = Router();

/**
 * @swagger
 * /api/health-packages:
 *   post:
 *     summary: Create a new health package
 *     tags: [Health Packages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePackageRequest'
 *     responses:
 *       201:
 *         description: Health package created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/HealthPackage'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         description: Service not found (when serviceIds are provided)
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/', asyncHandler(healthPackageController.createPackage.bind(healthPackageController)));

/**
 * @swagger
 * /api/health-packages:
 *   get:
 *     summary: Get all health packages
 *     tags: [Health Packages]
 *     responses:
 *       200:
 *         description: List of health packages retrieved successfully
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
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/HealthPackage'
 *                 count:
 *                   type: integer
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/', asyncHandler(healthPackageController.getAllPackages.bind(healthPackageController)));

/**
 * @swagger
 * /api/health-packages/{id}:
 *   get:
 *     summary: Get a single health package by ID
 *     tags: [Health Packages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Package ID
 *     responses:
 *       200:
 *         description: Health package retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/HealthPackage'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/:id', asyncHandler(healthPackageController.getPackageById.bind(healthPackageController)));

/**
 * @swagger
 * /api/health-packages/{id}:
 *   patch:
 *     summary: Update a health package
 *     tags: [Health Packages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Package ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               originalPrice:
 *                 type: number
 *               finalPrice:
 *                 type: number
 *               discountPct:
 *                 type: integer
 *               validityDays:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Health package updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/HealthPackage'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.patch('/:id', asyncHandler(healthPackageController.updatePackage.bind(healthPackageController)));

/**
 * @swagger
 * /api/health-packages/{id}:
 *   delete:
 *     summary: Delete a health package
 *     tags: [Health Packages]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Package ID
 *     responses:
 *       200:
 *         description: Health package deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete('/:id', asyncHandler(healthPackageController.deletePackage.bind(healthPackageController)));

/**
 * @swagger
 * /api/health-packages/services:
 *   post:
 *     summary: Add a service to a package
 *     tags: [Health Packages]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - packageId
 *               - serviceId
 *             properties:
 *               packageId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the package
 *               serviceId:
 *                 type: string
 *                 format: uuid
 *                 description: ID of the service to add
 *     responses:
 *       201:
 *         description: Service added to package successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Bad request or service already in package
 *       404:
 *         description: Package or service not found
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/services', asyncHandler(healthPackageController.addServiceToPackage.bind(healthPackageController)));

/**
 * @swagger
 * /api/health-packages/{packageId}/services/{serviceId}:
 *   delete:
 *     summary: Remove a service from a package
 *     tags: [Health Packages]
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Package ID
 *       - in: path
 *         name: serviceId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Service ID
 *     responses:
 *       200:
 *         description: Service removed from package successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         description: Package not found or service not in package
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete('/:packageId/services/:serviceId', asyncHandler(healthPackageController.removeServiceFromPackage.bind(healthPackageController)));

/**
 * @swagger
 * /api/health-packages/{packageId}/services:
 *   get:
 *     summary: Get all services in a package
 *     tags: [Health Packages]
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Package ID
 *     responses:
 *       200:
 *         description: Package services retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       serviceId:
 *                         type: string
 *                       service:
 *                         $ref: '#/components/schemas/HealthService'
 *                 count:
 *                   type: integer
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/:packageId/services', asyncHandler(healthPackageController.getPackageServices.bind(healthPackageController)));

export default router;
