import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { Permissions, auditLogQuerySchema, type AuditLogQueryInput } from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { AuditLogsService } from "./audit-logs.service";

@Controller("audit-logs")
@UseGuards(JwtAuthGuard, RbacGuard)
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  @RequirePermissions(Permissions.AUDIT_VIEW)
  listAuditLogs(@Query(new ZodValidationPipe(auditLogQuerySchema)) query: AuditLogQueryInput) {
    const orgId = RequestContext.get()?.orgId;
    return this.auditLogs.listAuditLogs(orgId, query);
  }
}
