import { getChannel, CHANNELS } from '../config/rabbitmq';
import { PrismaClient, Notification } from '@prisma/client';
import { smsService } from '../services/sms.service';

const prisma = new PrismaClient();

export const startSmsWorker = async () => {
  let channel: ReturnType<typeof getChannel>;
  try {
    channel = getChannel();
  } catch {
    console.warn('[SmsWorker] RabbitMQ not available — SMS worker skipped.');
    return;
  }
  const queueName = `${CHANNELS.SMS}.queue`;

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

      const toNumber = (dbNotification.payload as any)?.to || '+1234567890';
      await smsService.sendSms(toNumber, dbNotification.body);

      await prisma.notification.update({
        where: { id: dbNotification.id },
        data: { status: 'SENT' },
      });

      channel.ack(msg);
      console.log(`[SmsWorker] Successfully processed notification ${dbNotification.id}`);
    } catch (error) {
      console.error(`[SmsWorker] Failed processing message:`, error);
      
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
            console.log(`[SmsWorker] Max retries reached, marked FAILED for ${dbNotification.id}`);
          } else {
            await prisma.notification.update({
              where: { id: dbNotification.id },
              data: { retryCount: dbNotification.retryCount + 1, status: 'PENDING' },
            });
            channel.nack(msg, false, false); 
            console.log(`[SmsWorker] Sent to DLX for retry. ID: ${dbNotification.id}`);
          }
        } else {
          channel.ack(msg);
        }
      } else {
        channel.ack(msg);
      }
    }
  });

  console.log(`✅ Started SMS Worker on ${queueName}`);
};
