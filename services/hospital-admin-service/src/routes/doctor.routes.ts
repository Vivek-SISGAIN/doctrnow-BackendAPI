import { Router } from 'express';
import { asyncHandler } from '../utils';
import doctorController from '../controllers/doctor.controller';
import validate from '../middlewares/validation.middleware';
import createDoctorSchema from '../validators/doctor.validator';

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

router.post('/', validate(createDoctorSchema), asyncHandler(doctorController.createDoctor.bind(doctorController)));

export default router;
