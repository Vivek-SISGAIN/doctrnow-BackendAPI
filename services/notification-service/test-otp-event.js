const Redis = require('ioredis');

// Connect to Redis publisher
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
});

// Prepare fake payload
const emailPayload = {
  eventType: 'OtpSent',
  userId: 'test-user-id',
  email: 'test@example.com',
  otp: '123456',
  channel: 'EMAIL',
  purpose: 'LOGIN',
  tenantId: 'default',
  timestamp: new Date().toISOString()
};

const smsPayload = {
  eventType: 'OtpSent',
  userId: 'test-user-id',
  mobile: '+1234567890',
  otp: '654321',
  channel: 'SMS',
  purpose: 'LOGIN',
  tenantId: 'default',
  timestamp: new Date().toISOString()
};

async function testEvents() {
  try {
    console.log('Publishing fake auth.otp.sent EMAIL event...');
    await redis.publish('auth.otp.sent', JSON.stringify(emailPayload));
    
    console.log('Publishing fake auth.otp.sent SMS event...');
    await redis.publish('auth.otp.sent', JSON.stringify(smsPayload));

    console.log('Events published successfully. Check notification-service logs.');
  } catch (error) {
    console.error('Error publishing events:', error);
  } finally {
    redis.disconnect();
  }
}

testEvents();
