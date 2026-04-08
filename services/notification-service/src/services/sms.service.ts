import twilio from "twilio";

export class SmsService {
  private client: twilio.Twilio | null;
  private fromNumber: string;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    this.fromNumber = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || "";

    if (accountSid && authToken) {
      this.client = twilio(accountSid, authToken);
    } else {
      console.warn("Twilio credentials missing, SMS service is in fallback mode");
      this.client = null;
    }
  }

  async sendSms(to: string, body: string) {
    if (process.env.TWILIO_MOCK_MODE === "true") {
      console.log(`[SmsService][MOCK] Would send SMS to ${to}: "${body}"`);
      return;
    }

    if (!this.client) {
      throw new Error("Twilio client is not initialized. Set credentials or TWILIO_MOCK_MODE=true");
    }

    if (!this.fromNumber) {
      throw new Error("TWILIO_FROM_NUMBER (or TWILIO_PHONE_NUMBER) is required");
    }

    try {
      const message = await this.client.messages.create({
        body,
        from: this.fromNumber,
        to,
      });

      console.log(`[SmsService] Message sent to ${to}, SID: ${message.sid}`);
      return message;
    } catch (error) {
      console.error("[SmsService] Error sending SMS:", error);
      throw error;
    }
  }

  private buildOtpMessage(otp: string) {
    return `Your DoctrNow verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`;
  }

  async sendOtpSms(to: string, otp: string) {
    const message = this.buildOtpMessage(otp);
    return this.sendSms(to, message);
  }
}

export const smsService = new SmsService();
