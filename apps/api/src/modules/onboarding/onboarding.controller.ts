import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { onboardingStepUpdateSchema, Permissions, type OnboardingStepUpdateInput } from "@ledgerlite/shared";
import { JwtAuthGuard, type AuthenticatedRequest } from "../../auth/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { RbacGuard } from "../../rbac/rbac.guard";
import { OnboardingService } from "./onboarding.service";

@Controller("orgs/onboarding")
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions(Permissions.ORG_READ)
  getProgress(@Req() req: AuthenticatedRequest) {
    const orgId = RequestContext.get()?.orgId;
    const userId = RequestContext.get()?.userId;
    return this.onboarding.getProgress(orgId, userId, req.user?.membershipId);
  }

  @Patch("steps/:stepId")
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions(Permissions.ORG_READ)
  updateStep(
    @Req() req: AuthenticatedRequest,
    @Param("stepId") stepId: string,
    @Body(new ZodValidationPipe(onboardingStepUpdateSchema)) body: OnboardingStepUpdateInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const userId = RequestContext.get()?.userId;
    return this.onboarding.updateStepStatus(orgId, userId, req.user?.membershipId, stepId, body);
  }

  @Post("complete")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions(Permissions.ORG_READ)
  markComplete(@Req() req: AuthenticatedRequest) {
    const orgId = RequestContext.get()?.orgId;
    const userId = RequestContext.get()?.userId;
    return this.onboarding.markComplete(orgId, userId, req.user?.membershipId);
  }
}
