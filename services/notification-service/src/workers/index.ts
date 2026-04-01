import { startEmailWorker } from './email.worker';
import { startSmsWorker } from './sms.worker';
import { startPushWorker } from './push.worker';
import { startInAppWorker } from './inapp.worker';
import { startOtpWorker } from './otp.worker';

export const startWorkers = async () => {
  try {
    await Promise.all([
      startEmailWorker(),
      startSmsWorker(),
      startPushWorker(),
      startInAppWorker(),
      startOtpWorker(),
    ]);
    console.log('✅ All RabbitMQ Workers Started');
  } catch (error) {
    console.error('❌ Error starting workers:', error);
  }
};
