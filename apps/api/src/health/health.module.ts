import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { AuthModule } from "../modules/auth/auth.module";
import { RbacModule } from "../rbac/rbac.module";

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [HealthController],
})
export class HealthModule {}
