import { Router } from 'express';
import { createNotification } from '../controllers/notification.controller';
import { registerDevice } from '../controllers/device.controller';
import { sendOtp } from '../controllers/otp.controller';

const router = Router();

router.post('/notifications', createNotification);
router.post('/devices', registerDevice);
router.post('/otp/send', sendOtp);

export default router;
