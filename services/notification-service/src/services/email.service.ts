import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import fs from 'fs';
import path from 'path';

export class EmailService {
  private transporter: nodemailer.Transporter;
  private otpTemplateCache: string | null = null;

  constructor() {
    const host = process.env.SMTP_HOST || 'smtp.ethereal.email';
    const port = Number(process.env.SMTP_PORT) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    const transportOptions: SMTPTransport.Options = {
      host,
      port,
      secure: port === 465,
      ...(user && pass ? { auth: { user, pass } } : {}),
    };

    this.transporter = nodemailer.createTransport(transportOptions);
  }

  async sendEmail(to: string, subject: string, html: string) {
    try {
      const info = await this.transporter.sendMail({
        from: `"DoctorNow" <${process.env.SMTP_EMAIL || 'no-reply@doctornow.com'}>`,
        
        to,
        subject,
        html,
      });
      console.log(`[EmailService] Message sent: %s`, info.messageId);
      return info;
    } catch (error) {
      console.error(`[EmailService] Error sending email:`, error);
      throw error;
    }
  }

  private resolveOtpTemplatePath() {
    const candidatePaths = [
      path.join(process.cwd(), 'src', 'templates', 'otp-email.html'),
      path.join(process.cwd(), 'dist', 'templates', 'otp-email.html'),
      path.join(__dirname, '..', 'templates', 'otp-email.html'),
    ];

    const templatePath = candidatePaths.find((candidate) => fs.existsSync(candidate));
    if (!templatePath) {
      throw new Error('OTP email template not found');
    }

    return templatePath;
  }

  private getOtpTemplate() {
    if (!this.otpTemplateCache) {
      const templatePath = this.resolveOtpTemplatePath();
      this.otpTemplateCache = fs.readFileSync(templatePath, 'utf-8');
    }

    return this.otpTemplateCache;
  }

  async sendOtpEmail(to: string, otp: string, userName = 'User') {
    const template = this.getOtpTemplate();
    const htmlContent = template
      .replace(/\{\{OTP\}\}/g, otp)
      .replace(/\{\{USER_NAME\}\}/g, userName);

    return this.sendEmail(to, 'Your DoctrNow Verification Code', htmlContent);
  }
}

export const emailService = new EmailService();
