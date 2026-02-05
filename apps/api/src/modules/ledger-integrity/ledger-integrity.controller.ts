import { Controller, Get, Query } from "@nestjs/common";
import { LedgerIntegrityService } from "./ledger-integrity.service";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { Permissions, ledgerIntegrityQuerySchema, type LedgerIntegrityQueryInput } from "@ledgerlite/shared";
import { RequestContext } from "../../logging/request-context";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";

@Controller("ledger-integrity")
export class LedgerIntegrityController {
  constructor(private readonly integrity: LedgerIntegrityService) {}

  @Get("audit")
  @RequirePermissions(Permissions.AUDIT_VIEW)
  audit(
    @Query(new ZodValidationPipe(ledgerIntegrityQuerySchema)) query: LedgerIntegrityQueryInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    return this.integrity.audit(orgId, query);
  }
}
