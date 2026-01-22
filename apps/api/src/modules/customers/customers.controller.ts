import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  Permissions,
  paginationSchema,
  customerCreateSchema,
  customerUpdateSchema,
  type CustomerCreateInput,
  type CustomerUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { CustomersService } from "./customers.service";

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

const listCustomersQuerySchema = paginationSchema.extend({
  isActive: z.preprocess(parseBoolean, z.boolean().optional()),
  search: z.string().optional(),
});

type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

@Controller("customers")
@UseGuards(JwtAuthGuard, RbacGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(Permissions.CUSTOMER_READ)
  listCustomers(@Query(new ZodValidationPipe(listCustomersQuerySchema)) query: ListCustomersQuery) {
    const orgId = RequestContext.get()?.orgId;
    const { search, ...rest } = query;
    const q = query.q ?? search;
    return this.customers.listCustomers(orgId, { ...rest, q });
  }

  @Get(":id")
  @RequirePermissions(Permissions.CUSTOMER_READ)
  getCustomer(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.customers.getCustomer(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.CUSTOMER_WRITE)
  createCustomer(
    @Body(new ZodValidationPipe(customerCreateSchema)) body: CustomerCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.customers.createCustomer(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.CUSTOMER_WRITE)
  updateCustomer(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(customerUpdateSchema)) body: CustomerUpdateInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.customers.updateCustomer(orgId, id, actorUserId, body);
  }
}
