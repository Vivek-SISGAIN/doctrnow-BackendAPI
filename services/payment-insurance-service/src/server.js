/* eslint-disable no-process-exit */
/* eslint-disable no-console */
require('dotenv').config();
const app = require('./app');
const config = require('./config');

const PORT = config.port;
const HOST = config.host;

const server = app.listen(PORT, () => {
  console.log('===========================================================');
  console.log('🚀 Payment, Insurance & Cerner FHIR Service is running');
  console.log(`🌍 Environment: ${config.env}`);
  console.log(`📡 URL: http://${HOST}:${PORT}`);
  console.log(`📊 Health Check: http://${HOST}:${PORT}/health`);
  console.log(`📑 Swagger Docs: http://${HOST}:${PORT}/api-docs`);
  console.log(`🏥 Cerner Sandbox: ${config.cerner.baseUrl}`);
  console.log('===========================================================');
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
