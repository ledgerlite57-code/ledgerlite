import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuditService } from "../common/audit.service";
import { MailerService } from "../common/mailer.service";

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, AuditService, MailerService],
  exports: [AuthService, MailerService],
})
export class AuthModule {}
