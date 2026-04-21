import axios from 'axios';
import { PrismaClient, Channel, Notification, Prisma } from '@prisma/client';
import { QueueService } from './queue.service';
import { emitToUser } from '../sockets';

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

    // In-app notifications should be real-time even if RabbitMQ/worker is delayed.
    // Emit immediately and skip queueing to avoid duplicates.
    if (data.channel === 'IN_APP') {
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
      emitToUser(notification.userId, 'notification', eventPayload);
      emitToUser(notification.userId, 'notification:new', eventPayload);
      return notification;
    }

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
    options?: { limit?: number; offset?: number },
  ): Promise<Notification[]> {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
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
    const profileServiceUrl = process.env.PROFILE_SERVICE_URL;
    if (!profileServiceUrl) {
      throw new Error('PROFILE_SERVICE_URL is not configured');
    }

    const normalizedRoles = roles.map((role) => role.toUpperCase());
    const userIds = new Set<string>();

    for (const role of normalizedRoles) {
      if (role === 'HOSPITAL_ADMIN') {
        const path = hospitalId
          ? `/api/hospital-admins/hospital/id/${hospitalId}`
          : '/api/hospital-admins';
        const response = await axios.get(`${profileServiceUrl}${path}`);
        const records = response?.data?.data ?? response?.data ?? [];
        for (const admin of records) {
          if (admin?.userId) userIds.add(admin.userId);
        }
      }

      if (role === 'DOCTOR') {
        const response = await axios.get(`${profileServiceUrl}/api/doctors`);
        const records = response?.data?.data ?? response?.data ?? [];
        for (const doctor of records) {
          if (doctor?.userId) userIds.add(doctor.userId);
        }
      }

      if (role === 'PATIENT') {
        const response = await axios.get(`${profileServiceUrl}/api/patients`);
        const records = response?.data?.data ?? response?.data ?? [];
        for (const patient of records) {
          if (patient?.userId) userIds.add(patient.userId);
        }
      }
    }

    return [...userIds];
  }
}
