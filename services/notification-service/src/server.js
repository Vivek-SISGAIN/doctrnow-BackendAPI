require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const redisSubscriber = require('./config/redis');
const { handleOtpSent } = require('./handlers/otp.handler');

const OTP_TOPIC = 'auth.otp.sent';

async function startServer() {
  try {
    await redisSubscriber.subscribe(OTP_TOPIC, (err, count) => {
      if (err) {
        console.error('Failed to subscribe to topic:', OTP_TOPIC, err);
      } else {
        console.log(`Subscribed to ${count} Redis channel(s). Listening for ${OTP_TOPIC}...`);
      }
    });

    redisSubscriber.on('message', async (channel, message) => {
      if (channel === OTP_TOPIC) {
        try {
          const raw = JSON.parse(message);
          const payload = raw.data ? raw.data : raw;
          console.log(`[EVENT] Received ${OTP_TOPIC} event for user ${payload.userId || payload.email || payload.mobile}`);
          await handleOtpSent(payload);
        } catch (error) {
          console.error('Error processing message payload:', error);
        }
      }
    });

  } catch (error) {
    console.error('Failed to start Notification Service:', error);
  }
}

process.on('SIGINT', () => {
  console.log('Notification service shutting down...');
  redisSubscriber.quit();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Notification service shutting down...');
  redisSubscriber.quit();
  process.exit(0);
});

console.log('Notification service started — listening for Redis events...');
startServer();