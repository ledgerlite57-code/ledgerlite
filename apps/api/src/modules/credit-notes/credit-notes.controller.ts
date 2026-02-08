import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  Permissions,
  paginationSchema,
  creditNoteCreateSchema,
  creditNoteApplySchema,
  creditNoteRefundSchema,
  creditNoteUnapplySchema,
  creditNoteUpdateSchema,
  type CreditNoteCreateInput,
  type CreditNoteApplyInput,
  type CreditNoteRefundInput,
  type CreditNoteUnapplyInput,
  type CreditNoteUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { CreditNotesService } from "./credit-notes.service";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const listCreditNotesQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  customerId: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  dateTo: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  amountMin: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  amountMax: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
});

type ListCreditNotesQuery = z.infer<typeof listCreditNotesQuerySchema>;

const creditNoteVoidActionSchema = z
  .object({
    negativeStockOverride: z.boolean().optional(),
    negativeStockOverrideReason: z.preprocess(
      emptyToUndefined,
      z.string().trim().min(3).max(240).optional(),
    ),
  })
  .optional()
  .transform((value) => value ?? {});

type CreditNoteVoidActionInput = z.infer<typeof creditNoteVoidActionSchema>;

@Controller("credit-notes")
@UseGuards(JwtAuthGuard, RbacGuard)
export class CreditNotesController {
  constructor(private readonly creditNotes: CreditNotesService) {}

  @Get()
  @RequirePermissions(Permissions.INVOICE_READ)
  listCreditNotes(@Query(new ZodValidationPipe(listCreditNotesQuerySchema)) query: ListCreditNotesQuery) {
    const orgId = RequestContext.get()?.orgId;
    const { search, ...rest } = query;
    const q = query.q ?? search;
    return this.creditNotes.listCreditNotes(orgId, { ...rest, q });
  }

  @Get(":id")
  @RequirePermissions(Permissions.INVOICE_READ)
  getCreditNote(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.creditNotes.getCreditNote(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.INVOICE_WRITE)
  createCreditNote(
    @Body(new ZodValidationPipe(creditNoteCreateSchema)) body: CreditNoteCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.creditNotes.createCreditNote(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.INVOICE_WRITE)
  updateCreditNote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(creditNoteUpdateSchema)) body: CreditNoteUpdateInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.creditNotes.updateCreditNote(orgId, id, actorUserId, body);
  }

  @Post(":id/post")
  @RequirePermissions(Permissions.INVOICE_POST)
  postCreditNote(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.creditNotes.postCreditNote(orgId, id, actorUserId, idempotencyKey);
  }

  @Post(":id/void")
  @HttpCode(200)
  @RequirePermissions(Permissions.INVOICE_POST)
  voidCreditNote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(creditNoteVoidActionSchema)) body: CreditNoteVoidActionInput = {},
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.creditNotes.voidCreditNote(orgId, id, actorUserId, idempotencyKey, body);
  }

  @Post(":id/apply")
  @RequirePermissions(Permissions.INVOICE_POST)
  applyCreditNote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(creditNoteApplySchema)) body: CreditNoteApplyInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.creditNotes.applyCreditNote(orgId, id, actorUserId, body, idempotencyKey);
  }

  @Post(":id/unapply")
  @RequirePermissions(Permissions.INVOICE_POST)
  unapplyCreditNote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(creditNoteUnapplySchema)) body: CreditNoteUnapplyInput = {},
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.creditNotes.unapplyCreditNote(orgId, id, actorUserId, body, idempotencyKey);
  }

  @Post(":id/refund")
  @RequirePermissions(Permissions.INVOICE_POST)
  refundCreditNote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(creditNoteRefundSchema)) body: CreditNoteRefundInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.creditNotes.refundCreditNote(orgId, id, actorUserId, body, idempotencyKey);
  }
}
