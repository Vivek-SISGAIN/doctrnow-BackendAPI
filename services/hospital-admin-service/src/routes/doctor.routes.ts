import { Router } from 'express';
import { asyncHandler } from '../utils';
import doctorController from '../controllers/doctor.controller';
import { profileImageUpload } from '../middlewares/upload.middleware';

const router = Router();

/**
 * @swagger
 * /api/doctors:
 *   post:
 *     summary: Create a doctor
 *     tags:
 *       - Doctors
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateDoctorRequest'
 *     responses:
 *       201:
 *         description: Doctor created successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */

router.post('/', profileImageUpload, asyncHandler(doctorController.createDoctor.bind(doctorController)));


/**
 * @swagger
 * /api/doctors/{id}/status:
 *   patch:
 *     summary: Activate or deactivate a doctor
 *     tags:
 *       - Doctors
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Doctor profile ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE]
 *                 example: ACTIVE
 *     responses:
 *       200:
 *         description: Doctor status updated successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       404:
 *         description: Doctor not found
 *       502:
 *         description: Upstream service error
 */
router.patch(
    '/:id/status',
    asyncHandler(doctorController.updateStatus.bind(doctorController))
);


export default router;
