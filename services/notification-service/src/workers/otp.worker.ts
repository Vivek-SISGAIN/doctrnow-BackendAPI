import type { ConsumeMessage } from "amqplib";
import { getChannel, getOtpRabbitMQConfig } from "../config/rabbitmq";
import { emailService } from "../services/email.service";
import { smsService } from "../services/sms.service";
import type { EventEnvelope, OtpEventPayload } from "../types";

class OtpPayloadValidationError extends Error {}

const parseOtpPayload = (msg: ConsumeMessage): OtpEventPayload => {
  let rawMessage: unknown;

  try {
    rawMessage = JSON.parse(msg.content.toString());
  } catch (error) {
    throw new OtpPayloadValidationError("OTP event payload is not valid JSON");
  }

  const payload = (rawMessage as EventEnvelope<OtpEventPayload>)?.data ?? rawMessage;
  if (!payload || typeof payload !== "object") {
    throw new OtpPayloadValidationError("OTP event payload must be an object");
  }

  return payload as OtpEventPayload;
};

const getRetryCount = (msg: ConsumeMessage): number => {
  const xDeath = msg.properties.headers?.["x-death"];
  if (!Array.isArray(xDeath) || xDeath.length === 0) return 0;

  const count = Number((xDeath[0] as { count?: number }).count || 0);
  return Number.isNaN(count) ? 0 : count;
};

export const startOtpWorker = async () => {
  let channel: ReturnType<typeof getChannel>;
  try {
    channel = getChannel();
  } catch {
    console.warn('[OtpWorker] RabbitMQ not available — OTP worker skipped.');
    return;
  }
  const otpConfig = getOtpRabbitMQConfig();
  const maxRetries = Number(process.env.OTP_MAX_RETRIES || 3);

  channel.consume(otpConfig.queue, async (msg) => {
    if (!msg) return;

    try {
      const payload = parseOtpPayload(msg);
      const otp = payload.otp?.toString().trim();

      if (!otp) {
        throw new OtpPayloadValidationError("OTP is missing in payload");
      }

      const channelType = payload.channel?.toUpperCase();

      if (channelType === "EMAIL") {
        if (!payload.email) {
          throw new OtpPayloadValidationError("Email destination missing for EMAIL OTP");
        }
        await emailService.sendOtpEmail(payload.email, otp, payload.userName || "User");
      } else if (channelType === "SMS") {
        if (!payload.mobile) {
          throw new OtpPayloadValidationError("Mobile destination missing for SMS OTP");
        }
        await smsService.sendOtpSms(payload.mobile, otp);
      } else {
        throw new OtpPayloadValidationError(`Unsupported OTP channel: ${payload.channel || "UNKNOWN"}`);
      }

      channel.ack(msg);
      console.log(`[OtpWorker] Successfully processed OTP event for channel ${channelType}`);
    } catch (error) {
      if (error instanceof OtpPayloadValidationError) {
        channel.ack(msg);
        console.error(`[OtpWorker] Invalid payload dropped: ${error.message}`);
        return;
      }

      const retryCount = getRetryCount(msg);
      if (retryCount >= maxRetries) {
        channel.ack(msg);
        console.error(`[OtpWorker] Max retries reached (${maxRetries}), dropping message`);
        return;
      }

      channel.nack(msg, false, false);
      console.error(
        `[OtpWorker] Processing failed, sending to retry queue (attempt ${retryCount + 1}/${maxRetries})`,
        error
      );
    }
  });

  console.log(`[OtpWorker] Started on ${otpConfig.queue}`);
};
