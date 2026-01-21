import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { MailerService } from "./mailer.service";

@Module({
  providers: [AuditService, MailerService],
  exports: [AuditService, MailerService],
})
export class CommonModule {}
