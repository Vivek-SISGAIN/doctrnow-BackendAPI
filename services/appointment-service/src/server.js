/* eslint-disable no-process-exit */
/* eslint-disable no-console */
require('dotenv').config();
const cron = require('node-cron');
const app = require('./app');
const slotService = require('./service/slot.service');
const { startNotificationWorker } = require('./queue/notification.queue');

// Initialize BullMQ notification worker
startNotificationWorker();

const PORT = process.env.PORT || 3003;
const HOST = process.env.HOST || 'localhost';

const server = app.listen(PORT, () => {
  console.log('=================================');
  console.log('🚀 Appointment Service is running');
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 URL: http://${HOST}:${PORT}`);
  console.log(`📊 Health Check: http://${HOST}:${PORT}/health`);
  console.log('=================================');

  // Cron: remove past AVAILABLE slots (no appointment, no lock) daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      const result = await slotService.deletePastAvailableSlots();
      if (result.deleted > 0) {
        console.log(`[Cron] Deleted ${result.deleted} past available slot(s)`);
      }
    } catch (err) {
      console.error('[Cron] deletePastAvailableSlots failed:', err.message);
    }
  });
  console.log('📅 Cron: past-slot cleanup scheduled daily at 02:00');
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
