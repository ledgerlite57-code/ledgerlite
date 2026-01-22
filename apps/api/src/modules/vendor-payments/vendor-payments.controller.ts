import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  Permissions,
  vendorPaymentCreateSchema,
  vendorPaymentUpdateSchema,
  type VendorPaymentCreateInput,
  type VendorPaymentUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { VendorPaymentsService } from "./vendor-payments.service";

@Controller("vendor-payments")
@UseGuards(JwtAuthGuard, RbacGuard)
export class VendorPaymentsController {
  constructor(private readonly payments: VendorPaymentsService) {}

  @Get()
  @RequirePermissions(Permissions.VENDOR_PAYMENT_READ)
  listPayments(
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("vendorId") vendorId?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    return this.payments.listPayments(orgId, search, status, vendorId);
  }

  @Get(":id")
  @RequirePermissions(Permissions.VENDOR_PAYMENT_READ)
  getPayment(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.payments.getPayment(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.VENDOR_PAYMENT_WRITE)
  createPayment(
    @Body(new ZodValidationPipe(vendorPaymentCreateSchema)) body: VendorPaymentCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.payments.createPayment(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.VENDOR_PAYMENT_WRITE)
  updatePayment(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(vendorPaymentUpdateSchema)) body: VendorPaymentUpdateInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.payments.updatePayment(orgId, id, actorUserId, body);
  }

  @Post(":id/post")
  @RequirePermissions(Permissions.VENDOR_PAYMENT_POST)
  postPayment(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.payments.postPayment(orgId, id, actorUserId, idempotencyKey);
  }
}
