/* eslint-disable no-process-exit */
/* eslint-disable no-console */
import dotenv from 'dotenv';
import { Server } from 'http';
import app from './app';

// Load environment variables
dotenv.config();

const PORT: number = parseInt(process.env.PORT || '5001', 10);
const HOST: string = process.env.HOST || 'localhost';

const server: Server = app.listen(PORT, () => {
  console.log('=================================');
  console.log('🚀 Server is running');
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

process.on('unhandledRejection', (err: Error) => {
  console.error('Unhandled Promise Rejection:', err);
  server.close(() => {
    process.exit(1);
  });
});

export default server;
