/* eslint-disable no-process-exit */
/* eslint-disable no-console */
require('dotenv').config();
const app = require('./src/app');

const http = require('http');

const PORT = process.env.PORT || 3005;
const HOST = process.env.HOST || 'localhost';

const server = http.createServer(app);

// Initialize WebSocket server
const { initializeSocket } = require('./src/utils/socket');
initializeSocket(server);

server.listen(PORT, () => {
  console.log('=================================');
  console.log('🚀 Consultation Service is running');
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 URL: http://${HOST}:${PORT}`);
  console.log(`📊 Health Check: http://${HOST}:${PORT}/health`);
  console.log('=================================');
});


// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  server.close(() => {
    process.exit(1);
  });
});

module.exports = server;
