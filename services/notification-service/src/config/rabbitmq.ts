import amqp from "amqplib";
import type { Channel, ChannelModel } from "amqplib";

export const CHANNELS = {
  EMAIL: "email",
  SMS: "sms",
  PUSH: "push",
  IN_APP: "inapp",
};

export const EXCHANGES = {
  MAIN: "notifications_exchange",
  RETRY: "notifications_retry_exchange",
};

const QUEUES = [CHANNELS.EMAIL, CHANNELS.SMS, CHANNELS.PUSH, CHANNELS.IN_APP];

const DEFAULT_OTP_RABBITMQ_CONFIG = {
  EXCHANGE: "auth_events_exchange",
  ROUTING_KEY: "auth.otp.sent",
  QUEUE: "auth.otp.sent.queue",
  RETRY_QUEUE: "auth.otp.sent.retry.queue",
};

export const getOtpRabbitMQConfig = () => ({
  exchange: process.env.OTP_EVENTS_EXCHANGE || DEFAULT_OTP_RABBITMQ_CONFIG.EXCHANGE,
  routingKey: process.env.OTP_SENT_ROUTING_KEY || DEFAULT_OTP_RABBITMQ_CONFIG.ROUTING_KEY,
  queue: process.env.OTP_SENT_QUEUE || DEFAULT_OTP_RABBITMQ_CONFIG.QUEUE,
  retryQueue: process.env.OTP_SENT_RETRY_QUEUE || DEFAULT_OTP_RABBITMQ_CONFIG.RETRY_QUEUE,
});

let connection: ChannelModel;
let channel: Channel;

export const connectRabbitMQ = async () => {
  try {
    const rmqUrl = process.env.RABBITMQ_URL || "amqp://localhost";
    const retryDelayMs = Number(process.env.RABBITMQ_RETRY_DELAY_MS || 15000);
    const otpConfig = getOtpRabbitMQConfig();

    connection = await amqp.connect(rmqUrl);
    connection.on("error", (err) => {
      console.warn("[RabbitMQ] Connection error:", err.message);
    });
    connection.on("close", () => {
      console.warn("[RabbitMQ] Connection closed.");
    });

    channel = await connection.createChannel();
    channel.on("error", (err) => {
      console.warn("[RabbitMQ] Channel error:", err.message);
    });
    channel.on("close", () => {
      console.warn("[RabbitMQ] Channel closed.");
    });

    await channel.assertExchange(EXCHANGES.MAIN, "direct", { durable: true });
    await channel.assertExchange(EXCHANGES.RETRY, "direct", { durable: true });
    await channel.assertExchange(otpConfig.exchange, "topic", { durable: true });

    for (const routingKey of QUEUES) {
      const mainQueue = `${routingKey}.queue`;
      const retryQueue = `${routingKey}.retry.queue`;

      await channel.assertQueue(mainQueue, {
        durable: true,
        arguments: {
          "x-dead-letter-exchange": EXCHANGES.RETRY,
          "x-dead-letter-routing-key": routingKey,
        },
      });

      await channel.bindQueue(mainQueue, EXCHANGES.MAIN, routingKey);

      await channel.assertQueue(retryQueue, {
        durable: true,
        arguments: {
          "x-dead-letter-exchange": EXCHANGES.MAIN,
          "x-dead-letter-routing-key": routingKey,
          "x-message-ttl": retryDelayMs,
        },
      });

      await channel.bindQueue(retryQueue, EXCHANGES.RETRY, routingKey);
    }

    await channel.assertQueue(otpConfig.queue, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": EXCHANGES.RETRY,
        "x-dead-letter-routing-key": otpConfig.routingKey,
      },
    });

    await channel.bindQueue(otpConfig.queue, otpConfig.exchange, otpConfig.routingKey);

    await channel.assertQueue(otpConfig.retryQueue, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": otpConfig.exchange,
        "x-dead-letter-routing-key": otpConfig.routingKey,
        "x-message-ttl": retryDelayMs,
      },
    });

    await channel.bindQueue(otpConfig.retryQueue, EXCHANGES.RETRY, otpConfig.routingKey);

    console.log("RabbitMQ connected and topology setup complete");
  } catch (error) {
    // RabbitMQ is optional — HTTP endpoints (email, OTP) must still work without it.
    // Workers that depend on RabbitMQ will be skipped gracefully.
    console.warn("[RabbitMQ] Connection failed — service will start without queue support.", (error as Error).message);
  }
};

export const getChannel = (): Channel => {
  if (!channel) throw new Error("RabbitMQ channel not initialized");
  return channel;
};

export const closeRabbitMQ = async () => {
  if (channel) await channel.close();
  if (connection) await connection.close();
};
