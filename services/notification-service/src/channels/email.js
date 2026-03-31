const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendOtpEmail(to, otp, userName = 'User') {
  try {
    const templatePath = path.join(__dirname, '../templates/otp-email.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf-8');

    htmlContent = htmlContent.replace(/\{\{OTP\}\}/g, otp);
    htmlContent = htmlContent.replace(/\{\{USER_NAME\}\}/g, userName);

    const mailOptions = {
      from: process.env.SMTP_FROM || '"DoctrNow" <noreply@doctrnow.com>',
      to,
      subject: 'Your DoctrNow Verification Code',
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL] OTP sent to ${to}. Message ID: ${info.messageId}`);
  } catch (error) {
    console.error(`[EMAIL] Failed to send OTP email to ${to}:`, error);
    throw error; // Rethrow to let the handler manage it
  }
}

module.exports = {
  sendOtpEmail,
};
