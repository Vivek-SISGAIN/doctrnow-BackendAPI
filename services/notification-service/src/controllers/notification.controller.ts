import { Request, Response } from 'express';
import { NotificationService } from '../services/notification.service';
import { emailService } from '../services/email.service';

const normalizeUserIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
};

const normalizeChannels = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.map((channel) => String(channel).toUpperCase());
};

export const createNotification = async (req: Request, res: Response) => {
  try {
    const { userIds, channels, title, body, payload } = req.body;
    const normalizedUserIds = normalizeUserIds(userIds);
    const normalizedChannels = normalizeChannels(channels);

    if (!normalizedUserIds.length) {
      return res.status(400).json({ error: 'userIds must be a non-empty array' });
    }

    if (!normalizedChannels.length) {
      return res.status(400).json({ error: 'channels must be an array' });
    }

    const notifications = await NotificationService.createBulkNotifications(
      normalizedUserIds,
      normalizedChannels,
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

export const createSingleNotification = async (req: Request, res: Response) => {
  try {
    const { userId, channels, title, body, payload } = req.body;
    const normalizedChannels = normalizeChannels(channels);

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    if (!normalizedChannels.length) {
      return res.status(400).json({ error: 'channels must be a non-empty array' });
    }
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' });
    }

    const notifications = await NotificationService.createSingleNotification(
      String(userId),
      normalizedChannels,
      String(title),
      String(body),
      payload,
    );

    return res.status(201).json({
      message: 'Single-user notification created and scheduled',
      data: notifications,
    });
  } catch (error) {
    console.error('[NotificationController] createSingleNotification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createBulkNotification = async (req: Request, res: Response) => {
  try {
    const { userIds, channels, title, body, payload } = req.body;
    const normalizedUserIds = normalizeUserIds(userIds);
    const normalizedChannels = normalizeChannels(channels);

    if (!normalizedUserIds.length) {
      return res.status(400).json({ error: 'userIds must be a non-empty array' });
    }
    if (!normalizedChannels.length) {
      return res.status(400).json({ error: 'channels must be a non-empty array' });
    }
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' });
    }

    const notifications = await NotificationService.createBulkNotifications(
      normalizedUserIds,
      normalizedChannels,
      String(title),
      String(body),
      payload,
    );

    return res.status(201).json({
      message: 'Bulk notifications created and scheduled',
      data: notifications,
    });
  } catch (error) {
    console.error('[NotificationController] createBulkNotification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const createBroadcastNotification = async (req: Request, res: Response) => {
  try {
    const { roles, channels, title, body, payload, hospitalId } = req.body;
    const normalizedRoles = Array.isArray(roles)
      ? [...new Set(roles.map((role) => String(role).toUpperCase()).filter(Boolean))]
      : [];
    const normalizedChannels = normalizeChannels(channels);

    if (!normalizedRoles.length) {
      return res.status(400).json({ error: 'roles must be a non-empty array' });
    }
    if (!normalizedChannels.length) {
      return res.status(400).json({ error: 'channels must be a non-empty array' });
    }
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' });
    }

    const notifications = await NotificationService.createBroadcastNotifications(
      normalizedRoles,
      normalizedChannels,
      String(title),
      String(body),
      payload,
      hospitalId ? String(hospitalId) : undefined,
    );

    return res.status(201).json({
      message: 'Broadcast notifications created and scheduled',
      count: notifications.length,
      data: notifications,
    });
  } catch (error) {
    console.error('[NotificationController] createBroadcastNotification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const listNotifications = async (req: Request, res: Response) => {
  try {
    console.log('USER ID:', req.headers['x-user-id']);
    const userId = String(req.headers['x-user-id'] || 'c282190d-e5eb-45ef-9edc-93bb41bb10b3');
    if (!userId) {
      return res.status(401).json({ error: 'x-user-id header is required' });
    }

    const limit = Number(req.query.limit ?? 50);
    const offset = Number(req.query.offset ?? 0);

    const notifications = await NotificationService.listNotificationsForUser(userId, {
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    });

    return res.status(200).json({
      success: true,
      data: notifications,
    });
  } catch (error) {
    console.error('[NotificationController] listNotifications error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const markNotificationAsRead = async (req: Request, res: Response) => {
  try {
    const userId = String(req.headers['x-user-id'] || '');
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'x-user-id header is required' });
    }
    if (!id) {
      return res.status(400).json({ error: 'notification id is required' });
    }

    const notification = await NotificationService.markAsRead(id, userId);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    console.error('[NotificationController] markNotificationAsRead error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const markAllNotificationsAsRead = async (req: Request, res: Response) => {
  try {
    const userId = String(req.headers['x-user-id'] || '');
    if (!userId) {
      return res.status(401).json({ error: 'x-user-id header is required' });
    }

    const updatedCount = await NotificationService.markAllAsRead(userId);
    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      count: updatedCount,
    });
  } catch (error) {
    console.error('[NotificationController] markAllNotificationsAsRead error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteNotification = async (req: Request, res: Response) => {
  try {
    const userId = String(req.headers['x-user-id'] || '');
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'x-user-id header is required' });
    }

    if (!id) {
      return res.status(400).json({ error: 'notification id is required' });
    }

    const deleted = await NotificationService.deleteNotification(id, userId);
    if (!deleted) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.status(200).json({
      success: true,
      message: 'Notification deleted successfully',
    });
  } catch (error) {
    console.error('[NotificationController] deleteNotification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
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
