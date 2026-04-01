import { getChannel, CHANNELS } from '../config/rabbitmq';
import { PrismaClient, Notification } from '@prisma/client';
import { pushService } from '../services/push.service';

const prisma = new PrismaClient();

export const startPushWorker = async () => {
  const channel = getChannel();
  const queueName = `${CHANNELS.PUSH}.queue`;

  channel.consume(queueName, async (msg) => {
    if (!msg) return;

    try {
      const payload: Notification = JSON.parse(msg.content.toString());
      if (!payload) throw new Error('Invalid message format');

      const dbNotification = await prisma.notification.findUnique({
        where: { id: payload.id },
      });

      if (!dbNotification || dbNotification.status === 'SENT') {
        channel.ack(msg);
        return;
      }

      await prisma.notification.update({
        where: { id: dbNotification.id },
        data: { status: 'PROCESSING' },
      });

      await pushService.sendPushNotification(
        dbNotification.userId,
        dbNotification.title,
        dbNotification.body,
        dbNotification.payload
      );

      await prisma.notification.update({
        where: { id: dbNotification.id },
        data: { status: 'SENT' },
      });

      channel.ack(msg);
      console.log(`[PushWorker] Successfully processed notification ${dbNotification.id}`);
    } catch (error) {
      console.error(`[PushWorker] Failed processing message:`, error);
      
      const payload = JSON.parse(msg.content.toString());
      if (payload && payload.id) {
        const dbNotification = await prisma.notification.findUnique({ where: { id: payload.id } });
        if (dbNotification) {
          if (dbNotification.retryCount >= dbNotification.maxRetries) {
            await prisma.notification.update({
              where: { id: dbNotification.id },
              data: { status: 'FAILED' },
            });
            channel.ack(msg);
            console.log(`[PushWorker] Max retries reached, marked FAILED for ${dbNotification.id}`);
          } else {
            await prisma.notification.update({
              where: { id: dbNotification.id },
              data: { retryCount: dbNotification.retryCount + 1, status: 'PENDING' },
            });
            channel.nack(msg, false, false); 
            console.log(`[PushWorker] Sent to DLX for retry. ID: ${dbNotification.id}`);
          }
        } else {
          channel.ack(msg);
        }
      } else {
        channel.ack(msg);
      }
    }
  });

  console.log(`✅ Started Push Worker on ${queueName}`);
};
