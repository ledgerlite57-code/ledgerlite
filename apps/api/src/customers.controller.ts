import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  Permissions,
  customerCreateSchema,
  customerUpdateSchema,
  type CustomerCreateInput,
  type CustomerUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RbacGuard } from "./rbac/rbac.guard";
import { RequirePermissions } from "./rbac/permissions.decorator";
import { ZodValidationPipe } from "./common/zod-validation.pipe";
import { RequestContext } from "./logging/request-context";
import { CustomersService } from "./customers.service";

@Controller("customers")
@UseGuards(JwtAuthGuard, RbacGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions(Permissions.CUSTOMER_READ)
  listCustomers(@Query("search") search?: string, @Query("isActive") isActive?: string) {
    const orgId = RequestContext.get()?.orgId;
    const active = isActive === "true" ? true : isActive === "false" ? false : undefined;
    return this.customers.listCustomers(orgId, search, active);
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
