import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  Permissions,
  billCreateSchema,
  billUpdateSchema,
  type BillCreateInput,
  type BillUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RbacGuard } from "./rbac/rbac.guard";
import { RequirePermissions } from "./rbac/permissions.decorator";
import { ZodValidationPipe } from "./common/zod-validation.pipe";
import { RequestContext } from "./logging/request-context";
import { BillsService } from "./bills.service";

@Controller("bills")
@UseGuards(JwtAuthGuard, RbacGuard)
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  @Get()
  @RequirePermissions(Permissions.BILL_READ)
  listBills(@Query("search") search?: string, @Query("status") status?: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.bills.listBills(orgId, search, status);
  }

  @Get(":id")
  @RequirePermissions(Permissions.BILL_READ)
  getBill(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.bills.getBill(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.BILL_WRITE)
  createBill(
    @Body(new ZodValidationPipe(billCreateSchema)) body: BillCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.bills.createBill(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.BILL_WRITE)
  updateBill(@Param("id") id: string, @Body(new ZodValidationPipe(billUpdateSchema)) body: BillUpdateInput) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.bills.updateBill(orgId, id, actorUserId, body);
  }

  @Post(":id/post")
  @RequirePermissions(Permissions.BILL_POST)
  postBill(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.bills.postBill(orgId, id, actorUserId, idempotencyKey);
  }
}
