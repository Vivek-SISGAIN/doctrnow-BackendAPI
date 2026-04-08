import { getChannel, CHANNELS } from '../config/rabbitmq';
import { PrismaClient, Notification } from '@prisma/client';
import { emailService } from '../services/email.service';

const prisma = new PrismaClient();

export const startEmailWorker = async () => {
  const channel = getChannel();
  const queueName = `${CHANNELS.EMAIL}.queue`;

  channel.consume(queueName, async (msg) => {
    if (!msg) return;

    try {
      const payload: Notification = JSON.parse(msg.content.toString());
      if (!payload) throw new Error('Invalid message format');

      // 1. Fetch from DB to get the latest retryCount
      const dbNotification = await prisma.notification.findUnique({
        where: { id: payload.id },
      });

      if (!dbNotification || dbNotification.status === 'SENT') {
        channel.ack(msg);
        return;
      }

      // 2. Mark Processing
      await prisma.notification.update({
        where: { id: dbNotification.id },
        data: { status: 'PROCESSING' },
      });

      // 3. Execute channel logic
      // In reality, resolve email from userId. Assuming payload contains an email address or using a dummy.
      const toEmail = (dbNotification.payload as any)?.to || `${dbNotification.userId}@example.com`;
      await emailService.sendEmail(toEmail, dbNotification.title, dbNotification.body);

      // 4. Mark Sent & Ack
      await prisma.notification.update({
        where: { id: dbNotification.id },
        data: { status: 'SENT' },
      });

      channel.ack(msg);
      console.log(`[EmailWorker] Successfully processed notification ${dbNotification.id}`);
    } catch (error) {
      console.error(`[EmailWorker] Failed processing message:`, error);
      
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
            console.log(`[EmailWorker] Max retries reached, marked FAILED for ${dbNotification.id}`);
          } else {
            await prisma.notification.update({
              where: { id: dbNotification.id },
              data: { retryCount: dbNotification.retryCount + 1, status: 'PENDING' },
            });
            // Send to DLX 
            channel.nack(msg, false, false); 
            console.log(`[EmailWorker] Sent to DLX for retry. ID: ${dbNotification.id}`);
          }
        } else {
          channel.ack(msg);
        }
      } else {
        channel.ack(msg);
      }
    }
  });

  console.log(`✅ Started Email Worker on ${queueName}`);
};
