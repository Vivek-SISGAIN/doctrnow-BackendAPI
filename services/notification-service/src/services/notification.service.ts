import { PrismaClient, Channel } from '@prisma/client';
import { QueueService } from './queue.service';

const prisma = new PrismaClient();

export class NotificationService {
  static async createNotifications(userId: string, channels: string[], title: string, body: string, payload?: any) {
    const results = [];
    for (const ch of channels) {
      // Validate channel
      const upperCh = ch.toUpperCase() as Channel;
      if (!Object.values(Channel).includes(upperCh)) {
        continue;
      }

      // Create DB Entry
      const notification = await prisma.notification.create({
        data: {
          userId,
          channel: upperCh,
          title,
          body,
          payload: payload || {},
        },
      });

      // Publish to RabbitMQ using lowercase routing key (e.g. email, sms, push, inapp)
      let routingKey = upperCh.toLowerCase();
      if (routingKey === 'in_app') routingKey = 'inapp';

      await QueueService.publishMessage(routingKey, notification);
      
      results.push(notification);
    }
    
    return results;
  }
}
