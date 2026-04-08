import http from 'http';
import app from './app';
import { initializeSockets } from './sockets';
import { connectRabbitMQ } from './config/rabbitmq';
import { startWorkers } from './workers';
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

const startServer = async () => {
  try {
    // 1. Initialize RabbitMQ topology First
    await connectRabbitMQ();

    // 2. Initialize Socket.IO
    initializeSockets(server);

    // 3. Start Workers
    await startWorkers();

    // 4. Start HTTP Server
    server.listen(PORT, () => {
      console.log(`🚀 Notification Service running on port ${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
