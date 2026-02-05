import { Body, Controller, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { OrgService } from "./orgs.service";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import {
  Permissions,
  platformOrgLockDateUpdateSchema,
  platformOrgResetSettingsSchema,
  platformOrgStatusUpdateSchema,
  type PlatformOrgLockDateUpdateInput,
  type PlatformOrgResetSettingsInput,
  type PlatformOrgStatusUpdateInput,
} from "@ledgerlite/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";

@Controller("platform/orgs")
@UseGuards(JwtAuthGuard, RbacGuard)
export class PlatformOrgsController {
  constructor(private readonly orgService: OrgService) {}

  @Patch(":orgId/status")
  @RequirePermissions(Permissions.PLATFORM_ORG_WRITE)
  updateOrgStatus(
    @Param("orgId") orgId: string,
    @Body(new ZodValidationPipe(platformOrgStatusUpdateSchema)) body: PlatformOrgStatusUpdateInput,
  ) {
    const actorUserId = RequestContext.get()?.userId;
    return this.orgService.updateOrgActiveStatus(orgId, actorUserId, body.isActive, body.reason);
  }

  @Patch(":orgId/lock-date")
  @RequirePermissions(Permissions.PLATFORM_ORG_WRITE)
  updateLockDate(
    @Param("orgId") orgId: string,
    @Body(new ZodValidationPipe(platformOrgLockDateUpdateSchema)) body: PlatformOrgLockDateUpdateInput,
  ) {
    const actorUserId = RequestContext.get()?.userId;
    return this.orgService.updateOrgLockDate(orgId, actorUserId, body.lockDate, body.reason);
  }

  @Post(":orgId/reset-settings")
  @RequirePermissions(Permissions.PLATFORM_ORG_WRITE)
  resetSettings(
    @Param("orgId") orgId: string,
    @Body(new ZodValidationPipe(platformOrgResetSettingsSchema)) body: PlatformOrgResetSettingsInput,
  ) {
    const actorUserId = RequestContext.get()?.userId;
    return this.orgService.resetOrgSettings(orgId, actorUserId, body.reason);
  }
}

