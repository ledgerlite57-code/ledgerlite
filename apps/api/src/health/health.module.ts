import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { HealthController } from "./health.controller";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Module({
  imports: [JwtModule.register({})],
  controllers: [HealthController],
  providers: [JwtAuthGuard],
})
export class HealthModule {}
