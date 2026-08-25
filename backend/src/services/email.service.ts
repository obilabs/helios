import nodemailer, { Transporter } from 'nodemailer';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.EMAIL_ENCRYPTION_KEY || 'your-32-character-encryption-key!!';
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface SMTPSettings {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName?: string;
}

export class EmailService {
  private transporter: Transporter | null = null;
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  /**
   * Encrypt SMTP password for storage
   */
  static encryptPassword(password: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      ENCRYPTION_ALGORITHM,
      Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
      iv
    );

    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt SMTP password from storage
   */
  static decryptPassword(encryptedPassword: string): string {
    const parts = encryptedPassword.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];

    const decipher = crypto.createDecipheriv(
      ENCRYPTION_ALGORITHM,
      Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)),
      iv
    );

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Initialize SMTP transporter with organization settings
   */
  private async initializeTransporter(): Promise<void> {
    try {
      // Get SMTP settings for this organization
      const result = await db.query(
        // Canonical column is use_tls; aliased to secure to preserve the
        // nodemailer transport option consumed below.
        `SELECT host, port, use_tls AS secure, username, password_encrypted, from_email, from_name
         FROM smtp_settings
         WHERE organization_id = $1 AND is_active = true
         LIMIT 1`,
        [this.organizationId]
      );

      if (result.rows.length === 0) {
        // Fall back to environment variables
        if (!process.env.SMTP_HOST) {
          throw new Error('No SMTP settings configured for this organization');
        }

        const transportConfig: any = {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_SECURE === 'true'
        };

        // Only add auth if credentials are provided (for SMTP relay without auth)
        if (process.env.SMTP_USER && process.env.SMTP_PASS) {
          transportConfig.auth = {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          };
        }

        this.transporter = nodemailer.createTransport(transportConfig);

        logger.info('Email service initialized with environment settings', {
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT,
          authEnabled: !!(process.env.SMTP_USER && process.env.SMTP_PASS)
        });
        return;
      }

      const settings = result.rows[0];

      // Decrypt password
      const password = EmailService.decryptPassword(settings.password_encrypted);

      // Create transporter
      this.transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth: {
          user: settings.username,
          pass: password
        }
      });

      logger.info('Email service initialized with database settings', {
        organizationId: this.organizationId,
        host: settings.host
      });

    } catch (error: any) {
      logger.error('Failed to initialize email transporter', { error: error.message });
      throw error;
    }
  }

  /**
   * Send an email
   */
  async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      // Initialize transporter if not already done
      if (!this.transporter) {
        await this.initializeTransporter();
      }

      // Get sender info from SMTP settings or env
      const result = await db.query(
        'SELECT from_email, from_name FROM smtp_settings WHERE organization_id = $1 AND is_active = true LIMIT 1',
        [this.organizationId]
      );

      const fromEmail = result.rows[0]?.from_email || process.env.SMTP_FROM || 'noreply@helios.com';
      const fromName = result.rows[0]?.from_name || process.env.SMTP_FROM_NAME || 'Helios';

      // Send email
      const info = await this.transporter!.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.htmlToText(options.html)
      });

      logger.info('Email sent successfully', {
        organizationId: this.organizationId,
        to: options.to,
        subject: options.subject,
        messageId: info.messageId
      });

      return true;

    } catch (error: any) {
      logger.error('Failed to send email', {
        error: error.message,
        to: options.to,
        subject: options.subject
      });
      return false;
    }
  }

  /**
   * Send password setup email
   */
  async sendPasswordSetupEmail(
    toEmail: string,
    firstName: string,
    setupLink: string,
    expiryHours: number
  ): Promise<boolean> {
    try {
      // Get organization name
      const orgResult = await db.query(
        'SELECT name FROM organizations WHERE id = $1',
        [this.organizationId]
      );
      const organizationName = orgResult.rows[0]?.name || 'Helios';

      // Get email template. The canonical email_templates shape is
      // (template_key, subject, body_html, is_active); an org-specific row
      // overrides the built-in fallback below. body_html is already rendered
      // HTML so it is sent as-is, whereas the plain-text fallback is run
      // through textToHtml.
      const templateResult = await db.query(
        `SELECT subject, body_html FROM email_templates
         WHERE organization_id = $1
           AND template_key = 'password_setup'
           AND is_active = true
         LIMIT 1`,
        [this.organizationId]
      );

      let subject = 'Set up your {organizationName} account';
      const fallbackBody = `Hi {firstName},\n\nYour account has been created. Click the link below to set your password:\n\n{setupLink}\n\nThis link will expire in {expiryHours} hours.\n\nBest regards,\n{organizationName} Team`;
      let templateBodyHtml: string | null = null;

      if (templateResult.rows.length > 0) {
        subject = templateResult.rows[0].subject;
        templateBodyHtml = templateResult.rows[0].body_html;
      }

      // Replace template variables
      const variables = {
        firstName,
        setupLink,
        expiryHours: expiryHours.toString(),
        organizationName
      };

      subject = this.replaceVariables(subject, variables);
      const htmlBody = templateBodyHtml
        ? this.replaceVariables(templateBodyHtml, variables)
        : this.textToHtml(this.replaceVariables(fallbackBody, variables));

      // Send email
      return await this.sendEmail({
        to: toEmail,
        subject,
        html: htmlBody
      });

    } catch (error: any) {
      logger.error('Failed to send password setup email', {
        error: error.message,
        to: toEmail
      });
      return false;
    }
  }

  /**
   * Replace template variables in text
   */
  private replaceVariables(text: string, variables: Record<string, string>): string {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  /**
   * Convert plain text to HTML
   */
  private textToHtml(text: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin: 20px 0;
          }
          .footer { margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          ${text.split('\n').map(line => {
            // Convert links to buttons
            if (line.includes('http://') || line.includes('https://')) {
              const urlMatch = line.match(/(https?:\/\/[^\s]+)/);
              if (urlMatch) {
                return `<p><a href="${urlMatch[0]}" class="button">Set My Password</a></p>`;
              }
            }
            return `<p>${line}</p>`;
          }).join('')}
          <div class="footer">
            <p>If you didn't request this account, please ignore this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Convert HTML to plain text (simple version)
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
  }
}
