import mongoose from 'mongoose';

let isConnecting = false;
import dns from 'node:dns';

dns.setServers(['8.8.8.8', '1.1.1.1']);

dns.setDefaultResultOrder('ipv4first');

export const connectDB = async (): Promise<void> => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('MONGODB_URI missing');
    process.exit(1);
  }

  const connectWithRetry = async () => {
    if (isConnecting) return;

    isConnecting = true;

    try {
      console.log('Connecting MongoDB...');
      await mongoose.connect(uri, {
        family: 4,
      });
    } catch (error) {
      console.error('MongoDB failed. Retry in 5s...', error);
      setTimeout(connectWithRetry, 5000);
    } finally {
      isConnecting = false;
    }
  };

  mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected. Reconnecting...');
    setTimeout(connectWithRetry, 5000);
  });

  mongoose.connection.on('connected', () => {
    console.log('MongoDB connected');
  });

  await connectWithRetry();
};

export const isConnected = () => mongoose.connection.readyState === 1;
