require('dotenv').config();
const cerner = require('./cerner');

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3006', 10),
  host: process.env.HOST || 'localhost',
  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : [
          'http://localhost:8080',
          'http://localhost:3000',
          'http://localhost:5173',
          'http://127.0.0.1:5173',
          'http://localhost:1234',
          'http://localhost:4321',
          'http://127.0.0.1:4321',
        ],
    credentials: true,
  },
  internalSecret: process.env.INTERNAL_SERVICE_SECRET || 'super_secret_internal_key_123',
  cerner,
};
