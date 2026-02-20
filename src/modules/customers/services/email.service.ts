import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { createSmtpTransport } from '../../../common/email/smtp.config';
import {
  EmailService,
  EmailOptions,
  OtpEmailData,
  ResetLinkEmailData,
} from '../interfaces/email.interface';

@Injectable()
export class NodemailerEmailService implements EmailService {
  private readonly logger = new Logger(NodemailerEmailService.name);
  private transporter: nodemailer.Transporter | null;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    this.transporter = createSmtpTransport(
      this.configService,
      this.logger,
      'Customers',
    );
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        'Email transporter not configured. Skipping email send.',
      );
      return;
    }

    try {
      const fromEmail =
        this.configService.get<string>('SMTP_FROM_EMAIL') ||
        this.configService.get<string>('SMTP_USER') ||
        'noreply@deedee-trading.com';

      const mailOptions = {
        from: {
          name: this.configService.get<string>(
            'SMTP_FROM_NAME',
            'PhaJao invest',
          ),
          address: fromEmail,
        },
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const info: { messageId?: string } =
        await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `📧 Email sent successfully to ${options.to}. Message ID: ${info.messageId || 'N/A'}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      // Provide more context for TLS mismatch errors
      if (/wrong version number/i.test(errorMessage)) {
        throw new Error(
          `Failed to send email: TLS negotiation failed (wrong version number). Check SMTP_PORT & SMTP_SECURE combination. ${errorMessage}`,
        );
      }
      throw new Error(`Failed to send email: ${errorMessage}`);
    }
  }

  async sendOtpEmail(data: OtpEmailData): Promise<void> {
    const subject = 'Password Reset OTP - PhaJao invest';
    const html = this.generateOtpEmailHtml(data);
    const text = this.generateOtpEmailText(data);

    await this.sendEmail({
      to: data.email,
      subject,
      html,
      text,
    });
  }

  async sendResetLinkEmail(data: ResetLinkEmailData): Promise<void> {
    const subject = 'Password Reset Link - PhaJao invest';
    const html = this.generateResetLinkEmailHtml(data);
    const text = this.generateResetLinkEmailText(data);

    await this.sendEmail({
      to: data.email,
      subject,
      html,
      text,
    });
  }

  private generateOtpEmailHtml(data: OtpEmailData): string {
    const customerName = data.customerName || 'Customer';
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset OTP</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2c5aa0;">PhaJao invest</h1>
            <h2>Password Reset OTP</h2>
            
            <p>Hello ${customerName},</p>
            
            <p>You requested to reset your password. Please use the following OTP code:</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0; border-radius: 5px;">
              <h1 style="color: #2c5aa0; font-size: 36px; margin: 0; letter-spacing: 5px;">${data.otp}</h1>
            </div>
            
            <p><strong>Important:</strong></p>
            <ul>
              <li>This OTP is valid for 15 minutes only</li>
              <li>Do not share this OTP with anyone</li>
              <li>If you didn't request this, please ignore this email</li>
            </ul>
            
            <p>Expires at: ${data.expiresAt.toLocaleString()}</p>
            
            <hr style="margin: 30px 0;">
            <p style="font-size: 12px; color: #666;">
              This is an automated message from PhaJao invest. Please do not reply to this email.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  private generateOtpEmailText(data: OtpEmailData): string {
    const customerName = data.customerName || 'Customer';
    return `
    PhaJao invest - Password Reset OTP

    Hello ${customerName},

    You requested to reset your password. Please use the following OTP code: ${data.otp}

    Important:
    - This OTP is valid for 15 minutes only
    - Do not share this OTP with anyone
    - If you didn't request this, please ignore this email

    Expires at: ${data.expiresAt.toLocaleString()}

    This is an automated message from PhaJao invest.
    `.trim();
  }

  private generateResetLinkEmailHtml(data: ResetLinkEmailData): string {
    const customerName = data.customerName || 'Customer';
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset Link</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2c5aa0;">PhaJao invest</h1>
            <h2>Password Reset Request</h2>
            
            <p>Hello ${customerName},</p>
            
            <p>You requested to reset your password. Click the button below to reset your password:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${data.resetLink}" 
                 style="background-color: #2c5aa0; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Reset Password
              </a>
            </div>
            
            <p>Or copy and paste this link in your browser:</p>
            <p style="background-color: #f5f5f5; padding: 10px; border-radius: 3px; word-break: break-all;">
              ${data.resetLink}
            </p>
            
            <p><strong>Important:</strong></p>
            <ul>
              <li>This link is valid for 1 hour only</li>
              <li>Do not share this link with anyone</li>
              <li>If you didn't request this, please ignore this email</li>
            </ul>
            
            <p>Expires at: ${data.expiresAt.toLocaleString()}</p>
            
            <hr style="margin: 30px 0;">
            <p style="font-size: 12px; color: #666;">
              This is an automated message from PhaJao invest. Please do not reply to this email.
            </p>
          </div>
        </body>
      </html>
    `;
  }

  private generateResetLinkEmailText(data: ResetLinkEmailData): string {
    const customerName = data.customerName || 'Customer';
    return `
    PhaJao invest - Password Reset Request

    Hello ${customerName},

    You requested to reset your password. Please visit the following link to reset your password:

    ${data.resetLink}

    Important:
    - This link is valid for 1 hour only
    - Do not share this link with anyone
    - If you didn't request this, please ignore this email

    Expires at: ${data.expiresAt.toLocaleString()}

    This is an automated message from PhaJao invest.
    `.trim();
  }
}
