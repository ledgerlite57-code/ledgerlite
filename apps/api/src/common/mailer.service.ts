import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";
import { getApiEnv } from "./env";

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

  async sendInviteEmail(to: string, link: string) {
    const transporter = this.createTransporter();
    if (!transporter) {
      return;
    }
    await transporter.sendMail({
      from: getApiEnv().SMTP_FROM,
      to,
      subject: "You have been invited to LedgerLite",
      text: `You have been invited to LedgerLite. Open this link to continue: ${link}`,
      html: `<p>You have been invited to LedgerLite.</p><p><a href="${link}">Open your invite</a></p>`,
    });
  }
}
