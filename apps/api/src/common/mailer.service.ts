import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
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

type PurchaseOrderEmailContext = {
  orgName?: string | null;
  vendorName: string;
  poNumber: string;
  poDate: Date;
  expectedDeliveryDate?: Date | null;
  total: string;
  currency: string;
  pdfFileName: string;
  pdfContent: Buffer;
};

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

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

    try {
      const info = await transporter.sendMail({
        from: getApiEnv().SMTP_FROM,
        to,
        subject,
        text: `${intro}\n\nOpen this link to continue: ${link}\n\nIf the link is not clickable, copy and paste it into your browser.`,
        html: `<p>${intro}</p><p><a href="${link}">Open your invite</a></p><p>If the button above does not work, copy this URL:</p><p><a href="${link}">${link}</a></p>`,
      });
      this.logger.log(`Invite email sent to ${to}; messageId=${info.messageId ?? "n/a"}`);
    } catch (error) {
      this.logger.error(`Failed to send invite email to ${to}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  async sendEmailVerificationEmail(to: string, link: string, context: VerificationEmailContext) {
    const transporter = this.createTransporter();
    if (!transporter) {
      return;
    }

    const expiresOn = new Date(context.expiresAt).toISOString().slice(0, 10);

    try {
      const info = await transporter.sendMail({
        from: getApiEnv().SMTP_FROM,
        to,
        subject: "Verify your LedgerLite email",
        text: `Welcome to LedgerLite.\n\nVerify your email to activate your account: ${link}\n\nIf the link is not clickable, copy and paste it into your browser.\n\nThis link expires on ${expiresOn}.`,
        html: `<p>Welcome to LedgerLite.</p><p><a href="${link}">Verify your email</a></p><p>If the button above does not work, copy this URL:</p><p><a href="${link}">${link}</a></p><p>This link expires on ${expiresOn}.</p>`,
      });
      this.logger.log(`Verification email sent to ${to}; messageId=${info.messageId ?? "n/a"}`);
    } catch (error) {
      this.logger.error(`Failed to send verification email to ${to}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  async sendPurchaseOrderEmail(to: string, context: PurchaseOrderEmailContext) {
    let transporter: nodemailer.Transporter | null;
    try {
      transporter = this.createTransporter();
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        this.logger.warn(`Skipping purchase order email to ${to}; SMTP is not configured`);
        return false;
      }
      throw error;
    }

    if (!transporter) {
      return false;
    }

    const subject = `Purchase Order ${context.poNumber}`;
    const poDate = context.poDate.toISOString().slice(0, 10);
    const expectedDate = context.expectedDeliveryDate ? context.expectedDeliveryDate.toISOString().slice(0, 10) : "-";

    try {
      const info = await transporter.sendMail({
        from: getApiEnv().SMTP_FROM,
        to,
        subject,
        text:
          `Dear ${context.vendorName},\n\n` +
          `Please find attached purchase order ${context.poNumber} from ${context.orgName ?? "LedgerLite"}.\n` +
          `PO Date: ${poDate}\nExpected Delivery: ${expectedDate}\nTotal: ${context.currency} ${context.total}\n\n`,
        html:
          `<p>Dear ${context.vendorName},</p>` +
          `<p>Please find attached purchase order <strong>${context.poNumber}</strong> from ${context.orgName ?? "LedgerLite"}.</p>` +
          `<p>PO Date: ${poDate}<br/>Expected Delivery: ${expectedDate}<br/>Total: ${context.currency} ${context.total}</p>`,
        attachments: [
          {
            filename: context.pdfFileName,
            content: context.pdfContent,
            contentType: "application/pdf",
          },
        ],
      });
      this.logger.log(`Purchase order email sent to ${to}; messageId=${info.messageId ?? "n/a"}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send purchase order email to ${to}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }
}
