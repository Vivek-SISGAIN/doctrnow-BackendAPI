import { getChannel, CHANNELS } from '../config/rabbitmq';
import { PrismaClient, Notification } from '@prisma/client';
import { emitToUser } from '../sockets';

const prisma = new PrismaClient();

export const startInAppWorker = async () => {
  let channel: ReturnType<typeof getChannel>;
  try {
    channel = getChannel();
  } catch {
    console.warn('[InAppWorker] RabbitMQ not available — in-app worker skipped.');
    return;
  }
  const queueName = `${CHANNELS.IN_APP}.queue`;

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

      // Emit over Socket.IO (room = userId)
      const eventPayload = {
        id: dbNotification.id,
        userId: dbNotification.userId,
        channel: dbNotification.channel,
        status: dbNotification.status,
        title: dbNotification.title,
        body: dbNotification.body,
        payload: dbNotification.payload,
        createdAt: dbNotification.createdAt,
      };
      emitToUser(dbNotification.userId, 'notification', eventPayload);
      emitToUser(dbNotification.userId, 'notification:new', eventPayload);

      await prisma.notification.update({
        where: { id: dbNotification.id },
        data: { status: 'SENT' },
      });

      channel.ack(msg);
      console.log(`[InAppWorker] Successfully processed notification ${dbNotification.id}`);
    } catch (error) {
      console.error(`[InAppWorker] Failed processing message:`, error);
      
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
            console.log(`[InAppWorker] Max retries reached, marked FAILED for ${dbNotification.id}`);
          } else {
            await prisma.notification.update({
              where: { id: dbNotification.id },
              data: { retryCount: dbNotification.retryCount + 1, status: 'PENDING' },
            });
            channel.nack(msg, false, false); 
            console.log(`[InAppWorker] Sent to DLX for retry. ID: ${dbNotification.id}`);
          }
        } else {
          channel.ack(msg);
        }
      } else {
        channel.ack(msg);
      }
    }
  });

  console.log(`✅ Started InApp Worker on ${queueName}`);
};
