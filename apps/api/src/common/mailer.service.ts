import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";
import { getApiEnv } from "./env";

type InviteEmailContext = {
  orgName?: string;
  inviterEmail?: string;
  roleName?: string;
  expiresAt?: Date;
  sendCount?: number;
  isResend?: boolean;
};

type VerificationEmailContext = {
  expiresAt: Date;
};

@Injectable()
export class MailerService {
  private createTransporter() {
    const env = getApiEnv();
    if (env.SMTP_DISABLE) {
      return null;
    }
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
      throw new ServiceUnavailableException("SMTP is not configured");
    }

    return nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }

  async sendInviteEmail(to: string, link: string, context?: InviteEmailContext) {
    const transporter = this.createTransporter();
    if (!transporter) {
      return;
    }
    const subject = context?.isResend ? "Reminder: your LedgerLite invite is ready" : "You have been invited to LedgerLite";
    const orgLabel = context?.orgName ? ` to join ${context.orgName}` : "";
    const roleLabel = context?.roleName ? ` as ${context.roleName}` : "";
    const inviterLabel = context?.inviterEmail ? ` Sent by ${context.inviterEmail}.` : "";
    const expiryLabel = context?.expiresAt
      ? ` Expires on ${new Date(context.expiresAt).toISOString().slice(0, 10)}.`
      : "";
    const resendLabel = context?.isResend && context?.sendCount ? ` This is resend #${context.sendCount}.` : "";
    const intro = `You have been invited${orgLabel}${roleLabel}.${inviterLabel}${expiryLabel}${resendLabel}`.trim();

    await transporter.sendMail({
      from: getApiEnv().SMTP_FROM,
      to,
      subject,
      text: `${intro}\n\nOpen this link to continue: ${link}`,
      html: `<p>${intro}</p><p><a href="${link}">Open your invite</a></p>`,
    });
  }

  async sendEmailVerificationEmail(to: string, link: string, context: VerificationEmailContext) {
    const transporter = this.createTransporter();
    if (!transporter) {
      return;
    }

    const expiresOn = new Date(context.expiresAt).toISOString().slice(0, 10);

    await transporter.sendMail({
      from: getApiEnv().SMTP_FROM,
      to,
      subject: "Verify your LedgerLite email",
      text: `Welcome to LedgerLite.\n\nVerify your email to activate your account: ${link}\n\nThis link expires on ${expiresOn}.`,
      html: `<p>Welcome to LedgerLite.</p><p><a href="${link}">Verify your email</a></p><p>This link expires on ${expiresOn}.</p>`,
    });
  }
}
