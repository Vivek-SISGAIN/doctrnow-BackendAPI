module.exports = function buildSmsMessage(otp) {
  return `Your DoctrNow verification code is: ${otp}. Valid for 5 minutes. Do not share this code.`;
};
