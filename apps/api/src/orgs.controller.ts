import { Body, Controller, Get, Headers, Patch, Post, UseGuards } from "@nestjs/common";
import { OrgService } from "./orgs.service";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RbacGuard } from "./rbac/rbac.guard";
import { RequirePermissions } from "./rbac/permissions.decorator";
import { Permissions, orgCreateSchema, orgUpdateSchema, type OrgCreateInput, type OrgUpdateInput } from "@ledgerlite/shared";
import { ZodValidationPipe } from "./common/zod-validation.pipe";
import { RequestContext } from "./logging/request-context";

@Controller("orgs")
@UseGuards(JwtAuthGuard, RbacGuard)
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Post()
  @RequirePermissions(Permissions.ORG_WRITE)
  createOrg(
    @Body(new ZodValidationPipe(orgCreateSchema)) body: OrgCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const userId = RequestContext.get()?.userId;
    if (!userId) {
      return this.orgService.createOrg(body, idempotencyKey, undefined);
    }
    return this.orgService.createOrg(body, idempotencyKey, userId);
  }

  @Get("current")
  @RequirePermissions(Permissions.ORG_READ)
  getCurrentOrg() {
    const orgId = RequestContext.get()?.orgId;
    return this.orgService.getCurrentOrg(orgId);
  }

  @Patch("current")
  @RequirePermissions(Permissions.ORG_WRITE)
  updateCurrentOrg(@Body(new ZodValidationPipe(orgUpdateSchema)) body: OrgUpdateInput) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.orgService.updateCurrentOrg(orgId, actorUserId, body);
  }

  @Get("roles")
  @RequirePermissions(Permissions.USER_INVITE)
  listRoles() {
    const orgId = RequestContext.get()?.orgId;
    return this.orgService.listRoles(orgId);
  }
}
