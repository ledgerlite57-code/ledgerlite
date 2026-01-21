import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  inviteAcceptSchema,
  inviteCreateSchema,
  membershipUpdateSchema,
  Permissions,
  type InviteAcceptInput,
  type InviteCreateInput,
  type MembershipUpdateInput,
} from "@ledgerlite/shared";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { RequestContext } from "../../logging/request-context";
import { OrgUsersService } from "./org-users.service";

@Controller("orgs/users")
export class OrgUsersController {
  constructor(private readonly users: OrgUsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions(Permissions.USER_MANAGE)
  listUsers() {
    const orgId = RequestContext.get()?.orgId;
    return this.users.listUsers(orgId);
  }

  @Post("invite")
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions(Permissions.USER_INVITE)
  createInvite(
    @Body(new ZodValidationPipe(inviteCreateSchema)) body: InviteCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.users.createInvite(orgId, actorUserId, body, idempotencyKey);
  }

  @Post("invite/accept")
  acceptInvite(@Body(new ZodValidationPipe(inviteAcceptSchema)) body: InviteAcceptInput) {
    return this.users.acceptInvite(body);
  }

  @Patch(":id")
  @UseGuards(JwtAuthGuard, RbacGuard)
  @RequirePermissions(Permissions.USER_MANAGE)
  updateMembership(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(membershipUpdateSchema)) body: MembershipUpdateInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.users.updateMembership(orgId, id, actorUserId, body);
  }
}
