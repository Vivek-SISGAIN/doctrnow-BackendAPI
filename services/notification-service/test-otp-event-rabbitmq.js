require("dotenv").config();
const amqp = require("amqplib");

const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost";
const OTP_EVENTS_EXCHANGE = process.env.OTP_EVENTS_EXCHANGE || "auth_events_exchange";
const OTP_SENT_ROUTING_KEY = process.env.OTP_SENT_ROUTING_KEY || "auth.otp.sent";

const emailPayload = {
  eventType: "OtpSent",
  userId: "test-user-id",
  email: "vinayak.sisgain@gmail.com",
  otp: "123456",
  channel: "EMAIL",
  purpose: "LOGIN",
  tenantId: "default",
  timestamp: new Date().toISOString(),
};

const smsPayload = {
  eventType: "OtpSent",
  userId: "test-user-id",
  mobile: "+1234567890",
  otp: "654321",
  channel: "SMS",
  purpose: "LOGIN",
  tenantId: "default",
  timestamp: new Date().toISOString(),
};

async function publishOtpEvents() {
  const connection = await amqp.connect(RABBITMQ_URL);
  const channel = await connection.createChannel();

  await channel.assertExchange(OTP_EVENTS_EXCHANGE, "topic", { durable: true });

  channel.publish(
    OTP_EVENTS_EXCHANGE,
    OTP_SENT_ROUTING_KEY,
    Buffer.from(JSON.stringify(emailPayload)),
    { persistent: true }
  );

  channel.publish(
    OTP_EVENTS_EXCHANGE,
    OTP_SENT_ROUTING_KEY,
    Buffer.from(JSON.stringify(smsPayload)),
    { persistent: true }
  );

  console.log("Published EMAIL and SMS OTP test events");

  await channel.close();
  await connection.close();
}

publishOtpEvents().catch((error) => {
  console.error("Failed to publish OTP test events:", error);
  process.exit(1);
});
