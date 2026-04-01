import { Request, Response } from 'express';
import { NotificationService } from '../services/notification.service';

export const createNotification = async (req: Request, res: Response) => {
  try {
    const { userId, channels, title, body, payload } = req.body;

    if (!userId || !channels || !title || !body) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!Array.isArray(channels)) {
      return res.status(400).json({ error: 'channels must be an array' });
    }

    const notifications = await NotificationService.createNotifications(
      userId,
      channels,
      title,
      body,
      payload
    );

    res.status(201).json({
      message: 'Notifications created and scheduled',
      data: notifications,
    });
  } catch (error) {
    console.error('[NotificationController] create error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
