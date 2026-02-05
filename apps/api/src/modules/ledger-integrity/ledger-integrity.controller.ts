import { Controller, Get, Query } from "@nestjs/common";
import { LedgerIntegrityService } from "./ledger-integrity.service";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { Permissions, ledgerIntegrityQuerySchema, type LedgerIntegrityQueryInput } from "@ledgerlite/shared";
import { OrgId } from "../../common/org-id.decorator";
import { ZodValidationPipe } from "../../common/zod-validation-pipe";

@Controller("ledger-integrity")
export class LedgerIntegrityController {
  constructor(private readonly integrity: LedgerIntegrityService) {}

  @Get("audit")
  @RequirePermissions(Permissions.AUDIT_VIEW)
  audit(
    @OrgId() orgId: string,
    @Query(new ZodValidationPipe(ledgerIntegrityQuerySchema)) query: LedgerIntegrityQueryInput,
  ) {
    return this.integrity.audit(orgId, query);
  }
}
