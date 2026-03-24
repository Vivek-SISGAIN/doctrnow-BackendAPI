const twilio = require('twilio');
const buildSmsMessage = require('../templates/otp-sms');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

let twilioClient = null;

if (accountSid && authToken) {
  twilioClient = twilio(accountSid, authToken);
} else {
  console.warn('Twilio not configured, SMS disabled');
}

async function sendOtpSms(mobile, otp) {
  if (!twilioClient) {
    const message = buildSmsMessage(otp);
    console.log(`[SMS-MOCK] Twilio client not initialized. Would send to ${mobile}: "${message}"`);
    return;
  }

  try {
    const message = buildSmsMessage(otp);
    const result = await twilioClient.messages.create({
      body: message,
      from: fromNumber,
      to: mobile,
    });
    console.log(`[SMS] OTP sent to ${mobile}. SID: ${result.sid}`);
  } catch (error) {
    console.error(`[SMS] Failed to send OTP to ${mobile}:`, error);
    throw error;
  }
}

module.exports = {
  sendOtpSms,
};
