import { Request, Response } from 'express';
import { NotificationService } from '../services/notification.service';
import { emailService } from '../services/email.service';

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

export const sendPrescriptionEmail = async (req: Request, res: Response) => {
  try {
    const { to, patientName, doctorName, facilityName, rxId, attachments } = req.body;
    console.log(`[NotificationController] Received prescription email request: to=${to}, rxId=${rxId}, patientName=${patientName}`);

    if (!to || !rxId) {
      console.warn(`[NotificationController] Missing required fields for prescription email: to=${to}, rxId=${rxId}`);
      return res.status(400).json({ error: 'Missing required fields: to, rxId' });
    }

    await emailService.sendPrescriptionEmail({
      to,
      patientName,
      doctorName,
      facilityName,
      rxId,
      attachments,
    });

    res.status(200).json({
      success: true,
      message: 'Prescription email sent successfully',
    });
  } catch (error) {
    console.error('[NotificationController] sendPrescriptionEmail error:', error);
    res.status(500).json({ error: 'Failed to send prescription email' });
  }
};
