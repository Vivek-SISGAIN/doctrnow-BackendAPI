import { Router } from 'express';
import { asyncHandler } from '../utils';
import stripeStatusController from '../controllers/stripeStatus.controller';

const router = Router();

router.get('/', asyncHandler(stripeStatusController.getStripeStatus.bind(stripeStatusController)));

export default router;
