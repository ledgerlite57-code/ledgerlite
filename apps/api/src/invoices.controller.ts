import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  Permissions,
  invoiceCreateSchema,
  invoiceUpdateSchema,
  type InvoiceCreateInput,
  type InvoiceUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RbacGuard } from "./rbac/rbac.guard";
import { RequirePermissions } from "./rbac/permissions.decorator";
import { ZodValidationPipe } from "./common/zod-validation.pipe";
import { RequestContext } from "./logging/request-context";
import { InvoicesService } from "./invoices.service";

@Controller("invoices")
@UseGuards(JwtAuthGuard, RbacGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermissions(Permissions.INVOICE_READ)
  listInvoices(
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("customerId") customerId?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    return this.invoices.listInvoices(orgId, search, status, customerId);
  }

  @Get(":id")
  @RequirePermissions(Permissions.INVOICE_READ)
  getInvoice(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.invoices.getInvoice(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.INVOICE_WRITE)
  createInvoice(
    @Body(new ZodValidationPipe(invoiceCreateSchema)) body: InvoiceCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.invoices.createInvoice(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.INVOICE_WRITE)
  updateInvoice(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(invoiceUpdateSchema)) body: InvoiceUpdateInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.invoices.updateInvoice(orgId, id, actorUserId, body);
  }

  @Post(":id/post")
  @RequirePermissions(Permissions.INVOICE_POST)
  postInvoice(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.invoices.postInvoice(orgId, id, actorUserId, idempotencyKey);
  }
}
