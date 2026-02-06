import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  Permissions,
  paginationSchema,
  debitNoteCreateSchema,
  debitNoteApplySchema,
  debitNoteUnapplySchema,
  debitNoteUpdateSchema,
  type DebitNoteCreateInput,
  type DebitNoteApplyInput,
  type DebitNoteUnapplyInput,
  type DebitNoteUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { DebitNotesService } from "./debit-notes.service";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const listDebitNotesQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  vendorId: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  dateTo: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  amountMin: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  amountMax: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
});

type ListDebitNotesQuery = z.infer<typeof listDebitNotesQuerySchema>;

const debitNotePostActionSchema = z
  .object({
    negativeStockOverride: z.boolean().optional(),
    negativeStockOverrideReason: z.preprocess(
      emptyToUndefined,
      z.string().trim().min(3).max(240).optional(),
    ),
  })
  .optional()
  .transform((value) => value ?? {});

type DebitNotePostActionInput = z.infer<typeof debitNotePostActionSchema>;

@Controller("debit-notes")
@UseGuards(JwtAuthGuard, RbacGuard)
export class DebitNotesController {
  constructor(private readonly debitNotes: DebitNotesService) {}

  @Get()
  @RequirePermissions(Permissions.BILL_READ)
  listDebitNotes(@Query(new ZodValidationPipe(listDebitNotesQuerySchema)) query: ListDebitNotesQuery) {
    const orgId = RequestContext.get()?.orgId;
    const { search, ...rest } = query;
    const q = query.q ?? search;
    return this.debitNotes.listDebitNotes(orgId, { ...rest, q });
  }

  @Get(":id")
  @RequirePermissions(Permissions.BILL_READ)
  getDebitNote(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.debitNotes.getDebitNote(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.BILL_WRITE)
  createDebitNote(
    @Body(new ZodValidationPipe(debitNoteCreateSchema)) body: DebitNoteCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.debitNotes.createDebitNote(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.BILL_WRITE)
  updateDebitNote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(debitNoteUpdateSchema)) body: DebitNoteUpdateInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.debitNotes.updateDebitNote(orgId, id, actorUserId, body);
  }

  @Post(":id/post")
  @RequirePermissions(Permissions.BILL_POST)
  postDebitNote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(debitNotePostActionSchema)) body: DebitNotePostActionInput = {},
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.debitNotes.postDebitNote(orgId, id, actorUserId, idempotencyKey, body);
  }

  @Post(":id/void")
  @HttpCode(200)
  @RequirePermissions(Permissions.BILL_POST)
  voidDebitNote(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.debitNotes.voidDebitNote(orgId, id, actorUserId, idempotencyKey);
  }

  @Post(":id/apply")
  @RequirePermissions(Permissions.BILL_POST)
  applyDebitNote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(debitNoteApplySchema)) body: DebitNoteApplyInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.debitNotes.applyDebitNote(orgId, id, actorUserId, body, idempotencyKey);
  }

  @Post(":id/unapply")
  @RequirePermissions(Permissions.BILL_POST)
  unapplyDebitNote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(debitNoteUnapplySchema)) body: DebitNoteUnapplyInput = {},
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.debitNotes.unapplyDebitNote(orgId, id, actorUserId, body, idempotencyKey);
  }
}
