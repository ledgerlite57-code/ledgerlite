import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  Permissions,
  paymentReceivedCreateSchema,
  paymentReceivedUpdateSchema,
  type PaymentReceivedCreateInput,
  type PaymentReceivedUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { PaymentsReceivedService } from "./payments-received.service";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const listPaymentsQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().optional()),
  search: z.preprocess(emptyToUndefined, z.string().optional()),
  status: z.preprocess(emptyToUndefined, z.string().optional()),
  customerId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  dateFrom: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  dateTo: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  amountMin: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  amountMax: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
});

type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

@Controller("payments-received")
@UseGuards(JwtAuthGuard, RbacGuard)
export class PaymentsReceivedController {
  constructor(private readonly payments: PaymentsReceivedService) {}

  @Get()
  @RequirePermissions(Permissions.PAYMENT_RECEIVED_READ)
  listPayments(
    @Query(new ZodValidationPipe(listPaymentsQuerySchema)) query: ListPaymentsQuery,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const q = query.q ?? query.search;
    return this.payments.listPayments(orgId, {
      q,
      status: query.status,
      customerId: query.customerId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      amountMin: query.amountMin,
      amountMax: query.amountMax,
    });
  }

  @Get(":id")
  @RequirePermissions(Permissions.PAYMENT_RECEIVED_READ)
  getPayment(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.payments.getPayment(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.PAYMENT_RECEIVED_WRITE)
  createPayment(
    @Body(new ZodValidationPipe(paymentReceivedCreateSchema)) body: PaymentReceivedCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.payments.createPayment(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.PAYMENT_RECEIVED_WRITE)
  updatePayment(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(paymentReceivedUpdateSchema)) body: PaymentReceivedUpdateInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.payments.updatePayment(orgId, id, actorUserId, body);
  }

  @Post(":id/post")
  @RequirePermissions(Permissions.PAYMENT_RECEIVED_POST)
  postPayment(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.payments.postPayment(orgId, id, actorUserId, idempotencyKey);
  }

  @Post(":id/void")
  @RequirePermissions(Permissions.PAYMENT_RECEIVED_POST)
  voidPayment(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.payments.voidPayment(orgId, id, actorUserId, idempotencyKey);
  }
}
