import { Request, Response } from "express";
import { QueueService } from "../services/queue.service";
import type { OtpEventPayload } from "../types";

const SUPPORTED_OTP_CHANNELS = new Set(["EMAIL", "SMS"]);

export const sendOtp = async (req: Request, res: Response) => {
  try {
    const payload = req.body as OtpEventPayload;
    const normalizedChannel = payload.channel?.toUpperCase();
    const otp = payload.otp?.toString().trim();

    if (!otp) {
      return res.status(400).json({ error: "otp is required" });
    }

    if (!normalizedChannel || !SUPPORTED_OTP_CHANNELS.has(normalizedChannel)) {
      return res.status(400).json({ error: "channel must be EMAIL or SMS" });
    }

    if (normalizedChannel === "EMAIL" && !payload.email) {
      return res.status(400).json({ error: "email is required for EMAIL channel" });
    }

    if (normalizedChannel === "SMS" && !payload.mobile) {
      return res.status(400).json({ error: "mobile is required for SMS channel" });
    }

    const eventPayload: OtpEventPayload = {
      ...payload,
      otp,
      channel: normalizedChannel,
      eventType: payload.eventType || "OtpSent",
      timestamp: payload.timestamp || new Date().toISOString(),
    };

    await QueueService.publishOtpEvent(eventPayload);

    return res.status(202).json({
      message: "OTP event published successfully",
      data: eventPayload,
    });
  } catch (error) {
    console.error("[OtpController] sendOtp error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
