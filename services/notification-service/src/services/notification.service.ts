import axios from 'axios';
import { PrismaClient, Channel, Notification, Prisma } from '@prisma/client';
import { QueueService } from './queue.service';
import { emitToUser } from '../sockets';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

export class NotificationService {
  private static normalizeChannel(channel: string): Channel | null {
    const upperChannel = channel?.toUpperCase() as Channel;
    return Object.values(Channel).includes(upperChannel) ? upperChannel : null;
  }

  private static channelToRoutingKey(channel: Channel): string {
    const key = channel.toLowerCase();
    return key === 'in_app' ? 'inapp' : key;
  }

  private static async createAndQueueNotification(data: {
    userId: string,
    title: string,
    body: string,
    channel: Channel,
    payload?: Prisma.InputJsonValue,
  }): Promise<Notification> {
    const notification = await prisma.notification.create({
      data: {
        userId: data.userId,
        channel: data.channel,
        ...(data.channel === 'IN_APP' ? { status: 'SENT' } : {}),
        title: data.title,
        body: data.body,
        payload: data.payload ?? {},
      },
    });

    const eventPayload = {
      id: notification.id,
      userId: notification.userId,
      channel: notification.channel,
      status: notification.status,
      title: notification.title,
      body: notification.body,
      payload: notification.payload,
      createdAt: notification.createdAt,
    };

    // In-app notifications should be real-time even if RabbitMQ/worker is delayed.
    // Emit immediately and skip queueing to avoid duplicates.
    if (data.channel === 'IN_APP') {
      emitToUser(notification.userId, 'notification', eventPayload);
      emitToUser(notification.userId, 'notification:new', eventPayload);
      return notification;
    }

    // When the user is currently online, we rely on the IN_APP channel 
    // for real-time portal UI updates. Emitting here for PUSH would cause
    // duplicate notifications in the portal.
    // if (data.channel === 'PUSH') {
    //   emitToUser(notification.userId, 'notification', eventPayload);
    //   emitToUser(notification.userId, 'notification:new', eventPayload);
    // }

    await QueueService.publishMessage(this.channelToRoutingKey(data.channel), notification);

    return notification;
  }

  static async createNotifications(
    userId: string,
    channels: string[],
    title: string,
    body: string,
    payload?: Prisma.InputJsonValue,
  ): Promise<Notification[]> {
    const results: Notification[] = [];

    for (const channel of channels) {
      const normalizedChannel = this.normalizeChannel(channel);
      if (!normalizedChannel) {
        continue;
      }

      const notification = await this.createAndQueueNotification({
        userId,
        channel: normalizedChannel,
        title,
        body,
        payload,
      });
      results.push(notification);
    }

    return results;
  }

  static async createBulkNotifications(
    userIds: string[],
    channels: string[],
    title: string,
    body: string,
    payload?: Prisma.InputJsonValue,
  ): Promise<Notification[]> {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    const results: Notification[] = [];

    for (const userId of uniqueUserIds) {
      const userNotifications = await this.createNotifications(
        userId,
        channels,
        title,
        body,
        payload,
      );
      results.push(...userNotifications);
    }

    return results;
  }

  static async createSingleNotification(
    userId: string,
    channels: string[],
    title: string,
    body: string,
    payload?: Prisma.InputJsonValue,
  ): Promise<Notification[]> {
    return this.createNotifications(userId, channels, title, body, payload);
  }

  static async createBroadcastNotifications(
    roles: string[],
    channels: string[],
    title: string,
    body: string,
    payload?: Prisma.InputJsonValue,
    hospitalId?: string,
  ): Promise<Notification[]> {
    const recipients = await this.resolveUserIdsByRoles(roles, hospitalId);
    if (!recipients.length) return [];

    return this.createBulkNotifications(recipients, channels, title, body, payload);
  }

  static async listNotificationsForUser(
    userId: string,
    options?: { page?: number; limit?: number; offset?: number },
  ): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
    const limit = options?.limit ?? 50;
    const page = options?.page ?? 1;
    const skip = options?.offset ?? (page - 1) * limit;

    const [notifications, total, allUnread] = await Promise.all([
      prisma.notification.findMany({
        where: {
          userId,
          channel: Channel.IN_APP // Only show in-app notifications in the history list
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: skip,
      }),
      prisma.notification.count({
        where: {
          userId,
          channel: Channel.IN_APP
        }
      }),
      // Count ALL unread notifications (where payload.__meta.read is not true)
      prisma.notification.findMany({
        where: {
          userId,
          channel: Channel.IN_APP,
        },
        select: { id: true, payload: true },
      }),
    ]);

    // Derive unread count from payload.__meta.read flag across all notifications
    const unreadCount = allUnread.filter((n) => {
      const payload = n.payload && typeof n.payload === 'object' && !Array.isArray(n.payload)
        ? (n.payload as Record<string, unknown>)
        : {};
      const meta = payload.__meta && typeof payload.__meta === 'object' && !Array.isArray(payload.__meta)
        ? (payload.__meta as Record<string, unknown>)
        : {};
      return !meta.read;
    }).length;

    return { notifications, total, unreadCount };
  }

  static async markAsRead(
    notificationId: any,
    userId: string,
  ): Promise<Notification | null> {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) return null;

    const payloadRecord =
      notification.payload && typeof notification.payload === 'object' && !Array.isArray(notification.payload)
        ? (notification.payload as Record<string, unknown>)
        : {};

    const meta =
      payloadRecord.__meta && typeof payloadRecord.__meta === 'object' && !Array.isArray(payloadRecord.__meta)
        ? (payloadRecord.__meta as Record<string, unknown>)
        : {};

    return prisma.notification.update({
      where: { id: notificationId },
      data: {
        payload: {
          ...payloadRecord,
          __meta: {
            ...meta,
            read: true,
            readAt: new Date().toISOString(),
          },
        },
      },
    });
  }

  static async markAllAsRead(userId: string): Promise<number> {
    const notifications = await prisma.notification.findMany({
      where: { userId },
      select: { id: true, payload: true },
    });

    await Promise.all(
      notifications.map((notification) => {
        const payloadRecord =
          notification.payload &&
          typeof notification.payload === 'object' &&
          !Array.isArray(notification.payload)
            ? (notification.payload as Record<string, unknown>)
            : {};

        const meta =
          payloadRecord.__meta &&
          typeof payloadRecord.__meta === 'object' &&
          !Array.isArray(payloadRecord.__meta)
            ? (payloadRecord.__meta as Record<string, unknown>)
            : {};

        return prisma.notification.update({
          where: { id: notification.id },
          data: {
            payload: {
              ...payloadRecord,
              __meta: {
                ...meta,
                read: true,
                readAt: new Date().toISOString(),
              },
            },
          },
        });
      }),
    );

    return notifications.length;
  }

  static async deleteNotification(
    notificationId: any,
    userId: string,
  ): Promise<boolean> {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true },
    });

    if (!notification) return false;

    await prisma.notification.delete({ where: { id: notificationId } });
    return true;
  }

  private static async resolveUserIdsByRoles(
    roles: string[],
    hospitalId?: string,
  ): Promise<string[]> {
    const apiGateway = process.env.API_GATEWAY;
    const profileServiceUrl = process.env.PROFILE_SERVICE_URL;

    // Prefer routing through the API Gateway when configured.
    // Falls back to direct service URL for backward compatibility.
    const baseUrl = apiGateway ?? profileServiceUrl;
    if (!baseUrl) {
      throw new Error('API_GATEWAY (preferred) or PROFILE_SERVICE_URL must be configured');
    }

    // If we go through the gateway, authenticate as an internal service so JwtAuthGuard can bypass.
    const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
    const commonHeaders: Record<string, string> = {
      'X-Correlation-ID': randomUUID(),
      ...(internalSecret ? { 'x-internal-service-key': internalSecret } : {}),
    };

    const isGateway = !!apiGateway;
    const prefix = isGateway ? '' : ''; // keep for clarity

    const normalizedRoles = roles.map((role) => role.toUpperCase());
    const userIds = new Set<string>();

    for (const role of normalizedRoles) {
      const resolvedRole = role === 'HOSPITAL' ? 'HOSPITAL_ADMIN' : role;
      if (role === 'HOSPITAL') {
        console.warn('[NotificationService] Role "HOSPITAL" is deprecated; use "HOSPITAL_ADMIN". Treating as HOSPITAL_ADMIN.');
      }

      if (resolvedRole === 'HOSPITAL_ADMIN') {
        const path = hospitalId
          ? (isGateway
            ? `/profiles/hospital-admins/hospital/id/${hospitalId}`
            : `/api/hospital-admins/hospital/id/${hospitalId}`)
          : (isGateway ? '/profiles/hospital-admins' : '/api/hospital-admins');
        const response = await axios.get(`${baseUrl}${prefix}${path}`, { headers: commonHeaders });
        const records = response?.data?.data ?? response?.data ?? [];
        for (const admin of records) {
          if (admin?.userId) userIds.add(admin.userId);
        }
      }

      if (resolvedRole === 'DOCTOR') {
        const path = isGateway ? '/profiles/doctors' : '/api/doctors';
        const response = await axios.get(`${baseUrl}${prefix}${path}`, { headers: commonHeaders });
        const records = response?.data?.data ?? response?.data ?? [];
        for (const doctor of records) {
          if (doctor?.userId) userIds.add(doctor.userId);
        }
      }

      if (resolvedRole === 'PATIENT') {
        const path = isGateway ? '/profiles/patients' : '/api/patients';
        const response = await axios.get(`${baseUrl}${prefix}${path}`, { headers: commonHeaders });
        const records = response?.data?.data ?? response?.data ?? [];
        for (const patient of records) {
          if (patient?.userId) userIds.add(patient.userId);
        }
      }

      if (!['HOSPITAL_ADMIN', 'DOCTOR', 'PATIENT', 'HOSPITAL'].includes(role)) {
        console.warn(`[NotificationService] Unsupported role "${role}" ignored.`);
      }
    }

    return [...userIds];
  }
}
