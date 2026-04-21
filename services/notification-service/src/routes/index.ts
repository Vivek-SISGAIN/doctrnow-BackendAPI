import { Router } from 'express';
import {
  createNotification,
  createSingleNotification,
  createBulkNotification,
  createBroadcastNotification,
  broadcastBannerNotification,
  listNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  sendPrescriptionEmail,
} from '../controllers/notification.controller';

import { registerDevice } from '../controllers/device.controller';
import { sendOtp } from '../controllers/otp.controller';

const router = Router();

router.post('/notifications', createNotification);
router.post('/notifications/single', createSingleNotification);
router.post('/notifications/bulk', createBulkNotification);
router.post('/notifications/banner-broadcast', broadcastBannerNotification);
router.post('/notifications/broadcast', createBroadcastNotification);
router.get('/notifications', listNotifications);
router.patch('/notifications/read-all', markAllNotificationsAsRead);
router.patch('/notifications/:id/read', markNotificationAsRead);
router.delete('/notifications/:id', deleteNotification);
router.post('/emails/prescription', sendPrescriptionEmail);
router.post('/devices', registerDevice);
router.post('/otp/send', sendOtp);

export default router;
