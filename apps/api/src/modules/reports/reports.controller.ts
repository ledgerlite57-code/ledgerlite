import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import {
  Permissions,
  reportAgingSchema,
  reportAsOfSchema,
  reportLedgerLinesSchema,
  reportRangeSchema,
  reportVatSummarySchema,
  type ReportAgingInput,
  type ReportAsOfInput,
  type ReportLedgerLinesInput,
  type ReportRangeInput,
  type ReportVatSummaryInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { ReportsService } from "./reports.service";

@Controller("reports")
@UseGuards(JwtAuthGuard, RbacGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("trial-balance")
  @RequirePermissions(Permissions.REPORTS_VIEW)
  trialBalance(@Query(new ZodValidationPipe(reportRangeSchema)) query: ReportRangeInput) {
    const orgId = RequestContext.get()?.orgId;
    return this.reports.getTrialBalance(orgId, query);
  }

  @Get("profit-loss")
  @RequirePermissions(Permissions.REPORTS_VIEW)
  profitLoss(@Query(new ZodValidationPipe(reportRangeSchema)) query: ReportRangeInput) {
    const orgId = RequestContext.get()?.orgId;
    return this.reports.getProfitLoss(orgId, query);
  }

  @Get("balance-sheet")
  @RequirePermissions(Permissions.REPORTS_VIEW)
  balanceSheet(@Query(new ZodValidationPipe(reportAsOfSchema)) query: ReportAsOfInput) {
    const orgId = RequestContext.get()?.orgId;
    return this.reports.getBalanceSheet(orgId, query);
  }

  @Get("ar-aging")
  @RequirePermissions(Permissions.REPORTS_VIEW)
  arAging(@Query(new ZodValidationPipe(reportAgingSchema)) query: ReportAgingInput) {
    const orgId = RequestContext.get()?.orgId;
    return this.reports.getArAging(orgId, query);
  }

  @Get("ap-aging")
  @RequirePermissions(Permissions.REPORTS_VIEW)
  apAging(@Query(new ZodValidationPipe(reportAgingSchema)) query: ReportAgingInput) {
    const orgId = RequestContext.get()?.orgId;
    return this.reports.getApAging(orgId, query);
  }

  @Get("vat-summary")
  @RequirePermissions(Permissions.REPORTS_VIEW)
  vatSummary(@Query(new ZodValidationPipe(reportVatSummarySchema)) query: ReportVatSummaryInput) {
    const orgId = RequestContext.get()?.orgId;
    return this.reports.getVatSummary(orgId, query);
  }

  @Get("ledger-lines")
  @RequirePermissions(Permissions.REPORTS_VIEW)
  ledgerLines(@Query(new ZodValidationPipe(reportLedgerLinesSchema)) query: ReportLedgerLinesInput) {
    const orgId = RequestContext.get()?.orgId;
    return this.reports.getLedgerLines(orgId, query);
  }
}
