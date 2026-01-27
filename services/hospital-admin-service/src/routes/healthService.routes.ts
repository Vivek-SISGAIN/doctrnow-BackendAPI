import { Router } from 'express';
import { asyncHandler } from '../utils';
import healthServiceController from '../controllers/healthService.controller';

const router = Router();

/**
 * @swagger
 * /api/health-services:
 *   post:
 *     summary: Create a new health service
 *     tags: [Health Services]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateServiceRequest'
 *     responses:
 *       201:
 *         description: Health service created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/HealthService'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.post('/', asyncHandler(healthServiceController.createService.bind(healthServiceController)));

/**
 * @swagger
 * /api/health-services:
 *   get:
 *     summary: Get all health services
 *     tags: [Health Services]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           $ref: '#/components/schemas/ServiceType'
 *         description: Filter by service type
 *       - in: query
 *         name: status
 *         schema:
 *           $ref: '#/components/schemas/ServiceStatus'
 *         description: Filter by service status
 *     responses:
 *       200:
 *         description: List of health services retrieved successfully
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
 *                     $ref: '#/components/schemas/HealthService'
 *                 count:
 *                   type: integer
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/', asyncHandler(healthServiceController.getAllServices.bind(healthServiceController)));

/**
 * @swagger
 * /api/health-services/type/{type}:
 *   get:
 *     summary: Get services by type
 *     tags: [Health Services]
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           $ref: '#/components/schemas/ServiceType'
 *         description: Service type to filter by
 *     responses:
 *       200:
 *         description: Services retrieved successfully
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
 *                     $ref: '#/components/schemas/HealthService'
 *                 count:
 *                   type: integer
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/type/:type', asyncHandler(healthServiceController.getServicesByType.bind(healthServiceController)));

/**
 * @swagger
 * /api/health-services/{id}:
 *   get:
 *     summary: Get a single health service by ID
 *     tags: [Health Services]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Service ID
 *     responses:
 *       200:
 *         description: Health service retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/HealthService'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.get('/:id', asyncHandler(healthServiceController.getServiceById.bind(healthServiceController)));

/**
 * @swagger
 * /api/health-services/{id}:
 *   patch:
 *     summary: Update a health service
 *     tags: [Health Services]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Service ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 $ref: '#/components/schemas/ServiceType'
 *               originalPrice:
 *                 type: number
 *               finalPrice:
 *                 type: number
 *               status:
 *                 $ref: '#/components/schemas/ServiceStatus'
 *     responses:
 *       200:
 *         description: Health service updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/HealthService'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.patch('/:id', asyncHandler(healthServiceController.updateService.bind(healthServiceController)));

/**
 * @swagger
 * /api/health-services/{id}:
 *   delete:
 *     summary: Delete a health service
 *     tags: [Health Services]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Service ID
 *     responses:
 *       200:
 *         description: Health service deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
router.delete('/:id', asyncHandler(healthServiceController.deleteService.bind(healthServiceController)));

export default router;
