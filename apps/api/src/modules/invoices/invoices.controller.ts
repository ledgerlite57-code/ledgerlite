import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  Permissions,
  paginationSchema,
  invoiceCreateSchema,
  invoiceUpdateSchema,
  type InvoiceCreateInput,
  type InvoiceUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { InvoicesService } from "./invoices.service";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const listInvoicesQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  customerId: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  dateTo: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  amountMin: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  amountMax: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
});

type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;

const invoicePostActionSchema = z
  .object({
    negativeStockOverride: z.boolean().optional(),
    negativeStockOverrideReason: z.preprocess(
      emptyToUndefined,
      z.string().trim().min(3).max(240).optional(),
    ),
  })
  .optional()
  .transform((value) => value ?? {});

type InvoicePostActionInput = z.infer<typeof invoicePostActionSchema>;

@Controller("invoices")
@UseGuards(JwtAuthGuard, RbacGuard)
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  @RequirePermissions(Permissions.INVOICE_READ)
  listInvoices(@Query(new ZodValidationPipe(listInvoicesQuerySchema)) query: ListInvoicesQuery) {
    const orgId = RequestContext.get()?.orgId;
    const { search, ...rest } = query;
    const q = query.q ?? search;
    return this.invoices.listInvoices(orgId, { ...rest, q });
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
  postInvoice(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(invoicePostActionSchema)) body: InvoicePostActionInput = {},
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.invoices.postInvoice(orgId, id, actorUserId, idempotencyKey, body);
  }

  @Post(":id/void")
  @RequirePermissions(Permissions.INVOICE_POST)
  voidInvoice(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.invoices.voidInvoice(orgId, id, actorUserId, idempotencyKey);
  }
}
