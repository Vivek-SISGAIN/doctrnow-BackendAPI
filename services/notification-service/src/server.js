require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const redisSubscriber = require('./config/redis');
const { handleOtpSent } = require('./handlers/otp.handler');
const http = require('http');

const OTP_TOPIC = 'auth.otp.sent';
const PORT = process.env.PORT || 3008;

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

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'notification-service' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Notification service HTTP health check listening on port ${PORT}`);
});

process.on('SIGINT', () => {
  console.log('Notification service shutting down...');
  server.close();
  redisSubscriber.quit();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Notification service shutting down...');
  server.close();
  redisSubscriber.quit();
  process.exit(0);
});

console.log('Notification service started — listening for Redis events...');
startServer();