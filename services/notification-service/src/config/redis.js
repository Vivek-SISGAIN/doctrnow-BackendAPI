const Redis = require('ioredis');


const HOST = process.env.REDIS_HOST || 'localhost';
const PORT = process.env.REDIS_PORT || 6379;
const PASSWORD = process.env.REDIS_PASSWORD || undefined;

const redisSubscriber = new Redis({
  host: HOST,
  port: PORT,
  password: PASSWORD,
});

redisSubscriber.on('connect', () => {
  console.log('Redis subscriber connected');
});

redisSubscriber.on('error', (err) => {
  console.error('Redis subscriber error:', err);
});

module.exports = redisSubscriber;
