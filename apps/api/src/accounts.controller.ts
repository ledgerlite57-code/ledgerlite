import { Body, Controller, Get, Headers, Param, Patch, Post, UseGuards } from "@nestjs/common";
import {
  Permissions,
  accountCreateSchema,
  accountUpdateSchema,
  type AccountCreateInput,
  type AccountUpdateInput,
} from "@ledgerlite/shared";
import { ZodValidationPipe } from "./common/zod-validation.pipe";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RbacGuard } from "./rbac/rbac.guard";
import { RequirePermissions } from "./rbac/permissions.decorator";
import { RequestContext } from "./logging/request-context";
import { AccountsService } from "./accounts.service";

@Controller("accounts")
@UseGuards(JwtAuthGuard, RbacGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @RequirePermissions(Permissions.COA_READ)
  listAccounts() {
    const orgId = RequestContext.get()?.orgId;
    return this.accounts.listAccounts(orgId);
  }

  @Post()
  @RequirePermissions(Permissions.COA_WRITE)
  createAccount(
    @Body(new ZodValidationPipe(accountCreateSchema)) body: AccountCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.accounts.createAccount(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.COA_WRITE)
  updateAccount(@Param("id") id: string, @Body(new ZodValidationPipe(accountUpdateSchema)) body: AccountUpdateInput) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.accounts.updateAccount(orgId, id, actorUserId, body);
  }
}
