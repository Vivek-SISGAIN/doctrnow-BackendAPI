const { createClient } = require('redis');

const config = {};

if (process.env.REDIS_URL) {
  config.url = process.env.REDIS_URL;
} else {
  config.socket = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  };
  if (process.env.REDIS_PASSWORD) {
    config.password = process.env.REDIS_PASSWORD;
  }
}

const redisClient = createClient(config);

redisClient.on('error', (err) => console.error('❌ Redis Error', err));

const connectRedis = async () => {
  if (!redisClient.isOpen) {
    await redisClient.connect();
    console.log('✅ Redis connected');
  }
};

module.exports = { redisClient, connectRedis };
