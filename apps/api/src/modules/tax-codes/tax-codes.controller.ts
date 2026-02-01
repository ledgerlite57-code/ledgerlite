import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  Permissions,
  taxCodeCreateSchema,
  taxCodeUpdateSchema,
  paginationSchema,
  type TaxCodeCreateInput,
  type TaxCodeUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { TaxCodesService } from "./tax-codes.service";

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

const listTaxCodesQuerySchema = paginationSchema.extend({
  isActive: z.preprocess(parseBoolean, z.boolean().optional()),
  search: z.string().optional(),
});

type ListTaxCodesQuery = z.infer<typeof listTaxCodesQuerySchema>;

@Controller("tax-codes")
@UseGuards(JwtAuthGuard, RbacGuard)
export class TaxCodesController {
  constructor(private readonly taxCodes: TaxCodesService) {}

  @Get()
  @RequirePermissions(Permissions.TAX_READ)
  listTaxCodes(@Query(new ZodValidationPipe(listTaxCodesQuerySchema)) query: ListTaxCodesQuery) {
    const orgId = RequestContext.get()?.orgId;
    const { search, ...rest } = query;
    const q = query.q ?? search;
    return this.taxCodes.listTaxCodes(orgId, { ...rest, q });
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
