import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Permissions } from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { RequestContext } from "../../logging/request-context";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
@UseGuards(JwtAuthGuard, RbacGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("summary")
  @RequirePermissions(Permissions.REPORTS_VIEW)
  summary(@Query("range") range?: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.dashboard.getSummary(orgId, range);
  }
}
