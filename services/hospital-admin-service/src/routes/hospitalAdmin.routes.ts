import { Router } from 'express';
import hospitalAdminController from '../controllers/hospitalAdmin.controller';
import { asyncHandler } from '../utils';

const router = Router();

router.post('/' , asyncHandler(hospitalAdminController.createHospitalAdmin.bind(hospitalAdminController)))


export default router;
