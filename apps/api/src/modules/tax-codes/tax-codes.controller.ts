import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  Permissions,
  taxCodeCreateSchema,
  taxCodeUpdateSchema,
  type TaxCodeCreateInput,
  type TaxCodeUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { TaxCodesService } from "./tax-codes.service";

@Controller("tax-codes")
@UseGuards(JwtAuthGuard, RbacGuard)
export class TaxCodesController {
  constructor(private readonly taxCodes: TaxCodesService) {}

  @Get()
  @RequirePermissions(Permissions.TAX_READ)
  listTaxCodes(@Query("search") search?: string, @Query("isActive") isActive?: string) {
    const orgId = RequestContext.get()?.orgId;
    const active = isActive === "true" ? true : isActive === "false" ? false : undefined;
    return this.taxCodes.listTaxCodes(orgId, search, active);
  }

  @Get(":id")
  @RequirePermissions(Permissions.TAX_READ)
  getTaxCode(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.taxCodes.getTaxCode(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.TAX_WRITE)
  createTaxCode(
    @Body(new ZodValidationPipe(taxCodeCreateSchema)) body: TaxCodeCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.taxCodes.createTaxCode(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.TAX_WRITE)
  updateTaxCode(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(taxCodeUpdateSchema)) body: TaxCodeUpdateInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.taxCodes.updateTaxCode(orgId, id, actorUserId, body);
  }
}
