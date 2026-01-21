import { Controller, Get, UseGuards } from "@nestjs/common";
import { Permissions } from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { RequestContext } from "../../logging/request-context";
import { BankAccountsService } from "./bank-accounts.service";

@Controller("bank-accounts")
@UseGuards(JwtAuthGuard, RbacGuard)
export class BankAccountsController {
  constructor(private readonly bankAccounts: BankAccountsService) {}

  @Get()
  @RequirePermissions(Permissions.BANK_READ)
  listBankAccounts() {
    const orgId = RequestContext.get()?.orgId;
    return this.bankAccounts.listBankAccounts(orgId);
  }
}
