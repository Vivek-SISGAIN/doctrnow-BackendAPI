import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import fs from "fs";
import path from "path";

interface EmailAttachmentInput {
  filename: string;
  content?: string | Buffer;
  contentBase64?: string;
  contentType?: string;
}

export class EmailService {
  private transporter: nodemailer.Transporter;
  private otpTemplateCache: string | null = null;
  private prescriptionTemplateCache: string | null = null;

  constructor() {
    const host = process.env.SMTP_HOST || "smtp.ethereal.email";
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

    // Verify SMTP connectivity at startup
    this.transporter.verify((error, success) => {
      if (error) {
        console.error(`[EmailService] SMTP connection verification failed:`, error);
      } else {
        console.log(`[EmailService] SMTP server is ready to take our messages: ${success}`);
      }
    });
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
    attachments: EmailAttachmentInput[] = [],
  ) {
    try {
      console.log(`[EmailService] Attempting to send email to ${to} with subject: ${subject}`);
      const info = await this.transporter.sendMail({
        from: `"DoctorNow" <${process.env.SMTP_EMAIL || "no-reply@doctornow.com"}>`,

        to,
        subject,
        html,
        attachments: attachments.map((attachment) => ({
          filename: attachment.filename,
          content: attachment.contentBase64
            ? Buffer.from(attachment.contentBase64, "base64")
            : attachment.content,
          contentType: attachment.contentType,
        })),
      });
      console.log(`[EmailService] Message sent successfully: %s`, info.messageId);
      return info;
    } catch (error: any) {
      console.error(`[EmailService] Error sending email to ${to}:`, {
        message: error.message,
        code: error.code,
        command: error.command,
        response: error.response,
        stack: error.stack,
      });
      throw error;
    }
  }

  private resolveTemplatePath(fileName: string) {
    const candidatePaths = [
      path.join(__dirname, "..", "templates", fileName),
      path.join(__dirname, "..", "..", "src", "templates", fileName), // For TS development
      path.join(process.cwd(), "src", "templates", fileName),
      path.join(process.cwd(), "dist", "templates", fileName), // For production/built code
      path.join(process.cwd(), "templates", fileName),
    ];

    console.log(`[EmailService] Resolving template: ${fileName}`);
    const templatePath = candidatePaths.find((candidate) => {
      const exists = fs.existsSync(candidate);
      if (exists) console.log(`[EmailService] Found template at: ${candidate}`);
      return exists;
    });

    if (!templatePath) {
      console.error(`[EmailService] Email template not found: ${fileName}. Searched in:`, candidatePaths);
      throw new Error(`Email template not found: ${fileName}`);
    }

    return templatePath;
  }

  private getOtpTemplate() {
    if (!this.otpTemplateCache) {
      const templatePath = this.resolveTemplatePath("otp-email.html");
      this.otpTemplateCache = fs.readFileSync(templatePath, "utf-8");
    }

    return this.otpTemplateCache;
  }

  private getPrescriptionTemplate() {
    if (!this.prescriptionTemplateCache) {
      const templatePath = this.resolveTemplatePath("prescription-email.html");
      this.prescriptionTemplateCache = fs.readFileSync(templatePath, "utf-8");
    }

    return this.prescriptionTemplateCache;
  }

  async sendOtpEmail(to: string, otp: string, userName = "User") {
    const template = this.getOtpTemplate();
    const htmlContent = template
      .replace(/\{\{OTP\}\}/g, otp)
      .replace(/\{\{USER_NAME\}\}/g, userName);

    return this.sendEmail(to, "Your DoctrNow Verification Code", htmlContent);
  }

  async sendPrescriptionEmail(params: {
    to: string;
    patientName?: string;
    doctorName?: string;
    facilityName?: string;
    rxId?: string;
    attachments?: EmailAttachmentInput[];
  }) {
    console.log(`[EmailService] Preparing prescription email for ${params.to} (Rx: ${params.rxId})`);
    const template = this.getPrescriptionTemplate();
    const htmlContent = template
      .replace(/\{\{PATIENT_NAME\}\}/g, params.patientName || "Patient")
      .replace(/\{\{DOCTOR_NAME\}\}/g, params.doctorName || "Your doctor")
      .replace(/\{\{FACILITY_NAME\}\}/g, params.facilityName || "DoctorNow Medical Center")
      .replace(/\{\{RX_ID\}\}/g, params.rxId || "Prescription");

    return this.sendEmail(
      params.to,
      `Your Prescription from ${params.facilityName || "DoctorNow"}`,
      htmlContent,
      params.attachments || [],
    );
  }
}

export const emailService = new EmailService();
