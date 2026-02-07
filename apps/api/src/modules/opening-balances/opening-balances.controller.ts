import { Body, Controller, Get, Headers, HttpCode, Patch, Post, Put, UseGuards } from "@nestjs/common";
import {
  Permissions,
  openingBalancesCutOverSchema,
  openingBalancesDraftSchema,
  openingBalancesImportCsvSchema,
  openingInventoryDraftSchema,
  type OpeningBalancesCutOverInput,
  type OpeningBalancesDraftInput,
  type OpeningBalancesImportCsvInput,
  type OpeningInventoryDraftInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { OpeningBalancesService } from "./opening-balances.service";

@Controller("settings/opening-balances")
@UseGuards(JwtAuthGuard, RbacGuard)
export class OpeningBalancesController {
  constructor(private readonly openingBalances: OpeningBalancesService) {}

  @Get("status")
  @RequirePermissions(Permissions.ORG_READ)
  getStatus() {
    const orgId = RequestContext.get()?.orgId;
    return this.openingBalances.getStatus(orgId);
  }

  @Patch("cut-over")
  @RequirePermissions(Permissions.ORG_WRITE)
  setCutOverDate(@Body(new ZodValidationPipe(openingBalancesCutOverSchema)) body: OpeningBalancesCutOverInput) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.openingBalances.setCutOverDate(orgId, actorUserId, body);
  }

  @Put("draft-lines")
  @RequirePermissions(Permissions.ORG_WRITE)
  upsertDraftLines(@Body(new ZodValidationPipe(openingBalancesDraftSchema)) body: OpeningBalancesDraftInput) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.openingBalances.upsertDraftLines(orgId, actorUserId, body);
  }

  @Post("import-accounts")
  @RequirePermissions(Permissions.ORG_WRITE)
  importCsvAccounts(@Body(new ZodValidationPipe(openingBalancesImportCsvSchema)) body: OpeningBalancesImportCsvInput) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.openingBalances.importCsvAccounts(orgId, actorUserId, body);
  }

  @Put("inventory")
  @RequirePermissions(Permissions.ORG_WRITE)
  upsertInventoryDraft(@Body(new ZodValidationPipe(openingInventoryDraftSchema)) body: OpeningInventoryDraftInput) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.openingBalances.upsertInventoryDraft(orgId, actorUserId, body);
  }

  @Post("preview")
  @HttpCode(200)
  @RequirePermissions(Permissions.ORG_WRITE)
  preview() {
    const orgId = RequestContext.get()?.orgId;
    return this.openingBalances.preview(orgId);
  }

  @Post("post")
  @RequirePermissions(Permissions.ORG_WRITE)
  post(@Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.openingBalances.post(orgId, actorUserId, idempotencyKey);
  }
}
