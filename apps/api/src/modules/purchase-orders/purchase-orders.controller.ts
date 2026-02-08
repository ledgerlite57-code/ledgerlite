import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  Permissions,
  purchaseOrderConvertSchema,
  purchaseOrderCreateSchema,
  purchaseOrderListQuerySchema,
  purchaseOrderReceiveSchema,
  purchaseOrderRejectSchema,
  purchaseOrderUpdateSchema,
  type PurchaseOrderConvertInput,
  type PurchaseOrderCreateInput,
  type PurchaseOrderListQueryInput,
  type PurchaseOrderReceiveInput,
  type PurchaseOrderRejectInput,
  type PurchaseOrderUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { PurchaseOrdersService } from "./purchase-orders.service";

@Controller("purchase-orders")
@UseGuards(JwtAuthGuard, RbacGuard)
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Get()
  @RequirePermissions(Permissions.PURCHASE_ORDER_READ)
  list(@Query(new ZodValidationPipe(purchaseOrderListQuerySchema)) query: PurchaseOrderListQueryInput) {
    const orgId = RequestContext.get()?.orgId;
    const { search, ...rest } = query;
    const q = query.q ?? search;
    return this.purchaseOrders.listPurchaseOrders(orgId, { ...rest, q });
  }

  @Get(":id")
  @RequirePermissions(Permissions.PURCHASE_ORDER_READ)
  getOne(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.purchaseOrders.getPurchaseOrder(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.PURCHASE_ORDER_WRITE)
  create(
    @Body(new ZodValidationPipe(purchaseOrderCreateSchema)) body: PurchaseOrderCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.purchaseOrders.createPurchaseOrder(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.PURCHASE_ORDER_WRITE)
  update(@Param("id") id: string, @Body(new ZodValidationPipe(purchaseOrderUpdateSchema)) body: PurchaseOrderUpdateInput) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.purchaseOrders.updatePurchaseOrder(orgId, id, actorUserId, body);
  }

  @Post(":id/send")
  @RequirePermissions(Permissions.PURCHASE_ORDER_WRITE)
  send(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.purchaseOrders.sendPurchaseOrder(orgId, id, actorUserId);
  }

  @Post(":id/request-approval")
  @RequirePermissions(Permissions.PURCHASE_ORDER_WRITE)
  requestApproval(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.purchaseOrders.requestApproval(orgId, id, actorUserId);
  }

  @Post(":id/approve")
  @RequirePermissions(Permissions.PURCHASE_ORDER_APPROVE)
  approve(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.purchaseOrders.approvePurchaseOrder(orgId, id, actorUserId);
  }

  @Post(":id/reject")
  @RequirePermissions(Permissions.PURCHASE_ORDER_APPROVE)
  reject(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(purchaseOrderRejectSchema)) body: PurchaseOrderRejectInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.purchaseOrders.rejectPurchaseOrder(orgId, id, actorUserId, body);
  }

  @Post(":id/receive")
  @RequirePermissions(Permissions.PURCHASE_ORDER_WRITE)
  receive(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(purchaseOrderReceiveSchema)) body: PurchaseOrderReceiveInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.purchaseOrders.receivePurchaseOrder(orgId, id, actorUserId, body);
  }

  @Post(":id/close")
  @RequirePermissions(Permissions.PURCHASE_ORDER_WRITE)
  close(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.purchaseOrders.closePurchaseOrder(orgId, id, actorUserId);
  }

  @Post(":id/cancel")
  @RequirePermissions(Permissions.PURCHASE_ORDER_WRITE)
  cancel(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.purchaseOrders.cancelPurchaseOrder(orgId, id, actorUserId);
  }

  @Post(":id/convert-to-bill")
  @RequirePermissions(Permissions.PURCHASE_ORDER_WRITE)
  convertToBill(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(purchaseOrderConvertSchema)) body: PurchaseOrderConvertInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.purchaseOrders.convertToBill(orgId, id, actorUserId, body, idempotencyKey);
  }
}
