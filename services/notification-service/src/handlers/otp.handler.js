const { sendOtpEmail } = require('../channels/email');
const { sendOtpSms } = require('../channels/sms');

async function handleOtpSent(payload) {
  try {
    const { userId, email, mobile, otp, channel, purpose, tenantId } = payload;

    if (!otp) {
      console.error('OTP missing in payload');
      return;
    }

    if (channel === 'EMAIL' && email) {
      await sendOtpEmail(email, otp);
    } else if (channel === 'SMS' && mobile) {
      await sendOtpSms(mobile, otp);
    } else {
      console.warn(`Invalid channel or missing destination. Channel: ${channel}, Email: ${email}, Mobile: ${mobile}`);
    }
  } catch (error) {
    console.error('Error handling auth.otp.sent event:', error);
  }
}

module.exports = {
  handleOtpSent,
};
