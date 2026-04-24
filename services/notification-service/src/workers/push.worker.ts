import { getChannel, CHANNELS } from '../config/rabbitmq';
import { PrismaClient, Notification } from '@prisma/client';
import { pushService } from '../services/push.service';

const prisma = new PrismaClient();

export const startPushWorker = async () => {
  let channel: ReturnType<typeof getChannel>;
  try {
    channel = getChannel();
  } catch {
    console.warn('[PushWorker] RabbitMQ not available — push worker skipped.');
    return;
  }
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

      const response: any = await pushService.sendPushNotification(
        dbNotification.userId,
        dbNotification.title,
        dbNotification.body,
        dbNotification.payload
      );

      if (!response || typeof response.successCount !== 'number') {
        const err = new Error('[PushWorker] Push send did not return a BatchResponse');
        (err as any).code = 'PUSH_NO_RESPONSE';
        throw err;
      }

      if (response.successCount === 0) {
        const err = new Error('[PushWorker] Push send completed with 0 successes');
        (err as any).code = 'PUSH_ZERO_SUCCESS';
        throw err;
      }

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
          // NO_DEVICES is expected when the user hasn't registered a push device yet.
          // The in-app socket channel already delivered this notification in real-time,
          // so we silently skip — no retry, no FAILED status to avoid polluting the queue.
          if ((error as any)?.code === 'NO_DEVICES') {
            await prisma.notification.update({
              where: { id: dbNotification.id },
              data: { status: 'SENT' }, // Mark as "handled" so it doesn't retry endlessly
            });
            channel.ack(msg);
            console.log(`[PushWorker] No device for userId=${dbNotification.userId} — skipped (in-app socket already delivered).`);
          } else if (dbNotification.retryCount >= dbNotification.maxRetries) {
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
