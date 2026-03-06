import { Router, Request, Response } from 'express';
import healthServiceRoutes from './healthService.routes';
import healthPackageRoutes from './healthPackage.routes';
import doctorRoutes from './doctor.routes';

const router = Router();

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 message:
 *                   type: string
 *                   example: Hospital Admin Service is running
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'Hospital Admin Service is running',
    timestamp: new Date().toISOString()
  });
});

/**
 * @swagger
 * /api:
 *   get:
 *     summary: API information endpoint
 *     tags: [System]
 *     responses:
 *       200:
 *         description: API information and available endpoints
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 version:
 *                   type: string
 *                 status:
 *                   type: string
 *                 endpoints:
 *                   type: object
 *                   properties:
 *                     healthServices:
 *                       type: string
 *                     healthPackages:
 *                       type: string
 *                     health:
 *                       type: string
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'Welcome to DoctorNow Hospital Admin Service API',
    version: '1.0.0',
    status: 'active',
    endpoints: {
      healthServices: '/api/health-services',
      healthPackages: '/api/health-packages',
      health: '/api/health',
      doctors: '/api/doctors',
      documentation: '/api-docs'
    }
  });
});

// Register route modules
router.use('/health-services', healthServiceRoutes);
router.use('/doctors', doctorRoutes);
router.use('/health-packages', healthPackageRoutes);

export default router;
