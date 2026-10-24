import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { Env } from '../config/env.js';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    const port = config.get('SMTP_PORT', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    const pass = config.get('SMTP_PASS', { infer: true });

    this.from = config.get('MAIL_FROM', { infer: true });
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
    });
  }

  async sendOtp(to: string, code: string, ttlMinutes = 10) {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Your verification code',
        text: `Your verification code is ${code}. It expires in ${ttlMinutes} minutes.`,
        html: `
          <div style="font-family:sans-serif">
            <p>Your verification code is:</p>
            <h2 style="letter-spacing:4px">${code}</h2>
            <p>It expires in ${ttlMinutes} minutes. If you didn't request it, ignore this email.</p>
          </div>`,
      });
    } catch (err) {
      this.logger.error(`Failed to send OTP to ${to}`, (err as Error).stack);
      throw err;
    }
  }
}
