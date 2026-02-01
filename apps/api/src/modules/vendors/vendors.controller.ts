import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  Permissions,
  vendorCreateSchema,
  vendorUpdateSchema,
  paginationSchema,
  type VendorCreateInput,
  type VendorUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { VendorsService } from "./vendors.service";

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

const listVendorsQuerySchema = paginationSchema.extend({
  isActive: z.preprocess(parseBoolean, z.boolean().optional()),
  search: z.string().optional(),
});

type ListVendorsQuery = z.infer<typeof listVendorsQuerySchema>;

@Controller("vendors")
@UseGuards(JwtAuthGuard, RbacGuard)
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  @RequirePermissions(Permissions.VENDOR_READ)
  listVendors(@Query(new ZodValidationPipe(listVendorsQuerySchema)) query: ListVendorsQuery) {
    const orgId = RequestContext.get()?.orgId;
    const { search, ...rest } = query;
    const q = query.q ?? search;
    return this.vendors.listVendors(orgId, { ...rest, q });
  }

  @Get(":id")
  @RequirePermissions(Permissions.VENDOR_READ)
  getVendor(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.vendors.getVendor(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.VENDOR_WRITE)
  createVendor(
    @Body(new ZodValidationPipe(vendorCreateSchema)) body: VendorCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.vendors.createVendor(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.VENDOR_WRITE)
  updateVendor(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(vendorUpdateSchema)) body: VendorUpdateInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.vendors.updateVendor(orgId, id, actorUserId, body);
  }
}
