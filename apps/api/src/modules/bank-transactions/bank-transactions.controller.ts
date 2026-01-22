import { Body, Controller, Headers, Post, UseGuards } from "@nestjs/common";
import {
  Permissions,
  bankTransactionImportSchema,
  type BankTransactionImportInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { BankTransactionsService } from "./bank-transactions.service";

@Controller("bank-transactions")
@UseGuards(JwtAuthGuard, RbacGuard)
export class BankTransactionsController {
  constructor(private readonly bankTransactions: BankTransactionsService) {}

  @Post("import")
  @RequirePermissions(Permissions.BANK_WRITE)
  importTransactions(
    @Body(new ZodValidationPipe(bankTransactionImportSchema)) body: BankTransactionImportInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.bankTransactions.importTransactions(orgId, actorUserId, body, idempotencyKey);
  }
}
