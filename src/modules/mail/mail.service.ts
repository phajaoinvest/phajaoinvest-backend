import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { createSmtpTransport } from '../../common/email/smtp.config';

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null;

  // Admin emails array - easily manageable
  private readonly adminEmails: string[] = [
    'paokue77@gmail.com',
    'touakhang2003212@gmail.com',
    'searchmytalent98@gmail.com',
  ];

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    this.transporter = createSmtpTransport(
      this.configService,
      this.logger,
      'Notifications-Mail',
    );
  }

  /**
   * Send a raw email
   */
  async sendMail(options: MailOptions): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('Email transporter not configured. Skipping email send.');
      return;
    }

    try {
      const fromEmail =
        this.configService.get<string>('SMTP_FROM_EMAIL') ||
        this.configService.get<string>('SMTP_USER') ||
        'noreply@phajaoinvest.com';

      const mailOptions = {
        from: {
          name: this.configService.get<string>('SMTP_FROM_NAME', 'PhaJao Invest'),
          address: fromEmail,
        },
        to: Array.isArray(options.to) ? options.to.join(',') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || 'Please enable HTML to view this message',
      };

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(`📧 Email sent successfully. Message ID: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
    }
  }

  /**
   * Send notification to all admins
   */
  async sendAdminNotification(title: string, message: string, details?: any): Promise<void> {
    const html = this.getAdminTemplate(title, message, details);
    await this.sendMail({
      to: this.adminEmails,
      subject: `[ADMIN ALERT] ${title}`,
      html,
    });
  }

  /**
   * Send notification to a customer
   */
  async sendCustomerNotification(to: string, title: string, message: string, details?: any): Promise<void> {
    const html = this.getCustomerTemplate(title, message, details);
    await this.sendMail({
      to,
      subject: title,
      html,
    });
  }

  /**
   * Beautiful Admin Email Template
   */
  private getAdminTemplate(title: string, message: string, details?: any): string {
    const detailsHtml = details ? this.formatDetails(details) : '';
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f9; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
          .header { background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); color: #ffffff; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.5px; }
          .content { padding: 40px 30px; color: #334155; line-height: 1.6; }
          .alert-badge { background-color: #fef2f2; color: #991b1b; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; display: inline-block; margin-bottom: 20px; }
          .message-box { background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0; font-size: 16px; }
          .details-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          .details-table th { text-align: left; padding: 12px; background-color: #f1f5f9; border-bottom: 2px solid #e2e8f0; font-size: 13px; color: #64748b; text-transform: uppercase; }
          .details-table td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
          .footer { background-color: #f8fafc; padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; }
          .btn { background-color: #3b82f6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>PhaJao Invest Admin</h1>
          </div>
          <div class="content">
            <span class="alert-badge">SYSTEM NOTIFICATION</span>
            <h2 style="margin-top: 0; color: #0f172a;">${title}</h2>
            <div class="message-box">
              ${message}
            </div>
            ${detailsHtml}
            <div style="text-align: center; margin-top: 30px;">
              <a href="https://apanel.phajaoinvest.com" class="btn">Go to Dashboard</a>
            </div>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} PhaJao Invest. All rights reserved.
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Beautiful Customer Email Template
   */
  private getCustomerTemplate(title: string, message: string, details?: any): string {
    const detailsHtml = details ? this.formatDetails(details) : '';
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f4f8; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; padding: 40px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-weight: 800; }
          .content { padding: 40px 35px; color: #1e293b; line-height: 1.8; }
          .welcome-text { font-size: 18px; font-weight: 500; margin-bottom: 20px; }
          .main-message { font-size: 16px; color: #475569; margin-bottom: 30px; }
          .info-card { background-color: #f1f5f9; border-radius: 12px; padding: 25px; margin: 25px 0; }
          .footer { padding: 25px; text-align: center; color: #94a3b8; font-size: 13px; border-top: 1px solid #f1f5f9; }
          .social-links { margin-top: 15px; }
          .social-links a { color: #64748b; text-decoration: none; margin: 0 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>PhaJao Invest</h1>
          </div>
          <div class="content">
            <div class="welcome-text">${title}</div>
            <div class="main-message">
              ${message}
            </div>
            ${detailsHtml ? `<div class="info-card">${detailsHtml}</div>` : ''}
            <p>If you have any questions, please feel free to contact our support team.</p>
            <p>Best regards,<br>The PhaJao Invest Team</p>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} PhaJao Invest. Your trusted investment partner.
            <div class="social-links">
              <a href="#">Support</a> | <a href="#">Dashboard</a> | <a href="#">Terms</a>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private formatDetails(details: any): string {
    if (typeof details !== 'object') return details;

    let rows = '';
    for (const [key, value] of Object.entries(details)) {
      if (value === null || value === undefined) continue;

      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/^\w/, (c) => c.toUpperCase());

      rows += `
        <tr>
          <td style="font-weight: 600; color: #475569;">${label}</td>
          <td style="color: #0f172a;">${value}</td>
        </tr>
      `;
    }

    return `
      <table class="details-table" style="width: 100%; margin-top: 20px;">
        ${rows}
      </table>
    `;
  }
}
