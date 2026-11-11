import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendMailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class MailerService implements OnModuleInit {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter | null = null;
  private fromAddress: string = 'notification@dev.mulearn.app';

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.initTransporter();
  }

  private initTransporter() {
    const host =
      this.configService.get<string>('SMTP_HOST') ||
      this.configService.get<string>('EMAIL_HOST');
    const port = parseInt(
      this.configService.get<string>('SMTP_PORT') ||
        this.configService.get<string>('EMAIL_PORT') ||
        '587',
      10,
    );
    const user =
      this.configService.get<string>('SMTP_USER') ||
      this.configService.get<string>('EMAIL_HOST_USER');
    const pass =
      this.configService.get<string>('SMTP_PASSWORD') ||
      this.configService.get<string>('EMAIL_HOST_PASSWORD');
    const secure =
      (this.configService.get<string>('SMTP_SECURE') || 'false').toLowerCase() ===
      'true';
    this.fromAddress =
      this.configService.get<string>('SMTP_FROM') ||
      this.configService.get<string>('EMAIL_FROM') ||
      'notification@dev.mulearn.app';

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP credentials not fully provided. MailerService will run in disabled mode.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      host,
      port,
      secure,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false,
      },
    });

    this.logger.log(`MailerService initialized with host ${host}:${port} (from: ${this.fromAddress})`);
  }

  async sendMail(options: SendMailOptions): Promise<SendMailResult> {
    if (!this.transporter) {
      this.logger.warn(`MailerService transporter not configured. Skipped sending email to: ${options.to}`);
      return { success: false, error: 'Transporter not configured' };
    }

    try {
      const info = await this.transporter.sendMail({
        from: this.fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      this.logger.debug(`Email sent to ${options.to}. messageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      this.logger.error(`Failed to send email to ${options.to}: ${err.message}`, err.stack);
      return { success: false, error: err.message };
    }
  }

  async sendBatch(
    emails: SendMailOptions[],
    concurrency = 5,
  ): Promise<SendMailResult[]> {
    const results: SendMailResult[] = [];
    for (let i = 0; i < emails.length; i += concurrency) {
      const slice = emails.slice(i, i + concurrency);
      const batchResults = await Promise.all(slice.map((opts) => this.sendMail(opts)));
      results.push(...batchResults);
    }
    return results;
  }
}
