import { Controller, Get, ServiceUnavailableException, UseGuards } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RbacGuard } from "../rbac/rbac.guard";
import { RequirePermissions } from "../rbac/permissions.decorator";
import { Permissions } from "@ledgerlite/shared";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch {
      throw new ServiceUnavailableException("Database unavailable");
    }
  }

  @Get("protected")
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions(Permissions.HEALTH_VIEW)
  protected() {
    return { status: "ok" };
  }

  @Get("sentry-test")
  sentryTest() {
    if (process.env.NODE_ENV === "production") {
      return { ok: false };
    }
    throw new Error("Sentry test error");
  }
}
