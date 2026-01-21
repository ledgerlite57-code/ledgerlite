import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "../../auth/auth.controller";
import { AuthService } from "../../auth/auth.service";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { CommonModule } from "../../common/common.module";
import { RbacModule } from "../../rbac/rbac.module";

@Module({
  imports: [JwtModule.register({}), CommonModule, RbacModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
