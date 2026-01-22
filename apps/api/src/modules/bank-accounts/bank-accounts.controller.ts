import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  Permissions,
  bankAccountCreateSchema,
  bankAccountUpdateSchema,
  type BankAccountCreateInput,
  type BankAccountUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { BankAccountsService } from "./bank-accounts.service";

const parseBoolean = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return value;
};

const listBankAccountsQuerySchema = z.object({
  includeInactive: z.preprocess(parseBoolean, z.boolean().optional()),
});

type ListBankAccountsQuery = z.infer<typeof listBankAccountsQuerySchema>;

@Controller("bank-accounts")
@UseGuards(JwtAuthGuard, RbacGuard)
export class BankAccountsController {
  constructor(private readonly bankAccounts: BankAccountsService) {}

  @Get()
  @RequirePermissions(Permissions.BANK_READ)
  listBankAccounts(@Query(new ZodValidationPipe(listBankAccountsQuerySchema)) query: ListBankAccountsQuery) {
    const orgId = RequestContext.get()?.orgId;
    return this.bankAccounts.listBankAccounts(orgId, query.includeInactive);
  }

  @Post()
  @RequirePermissions(Permissions.BANK_WRITE)
  createBankAccount(
    @Body(new ZodValidationPipe(bankAccountCreateSchema)) body: BankAccountCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.bankAccounts.createBankAccount(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.BANK_WRITE)
  updateBankAccount(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(bankAccountUpdateSchema)) body: BankAccountUpdateInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.bankAccounts.updateBankAccount(orgId, id, actorUserId, body);
  }
}
