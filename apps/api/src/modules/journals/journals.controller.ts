import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  Permissions,
  paginationSchema,
  journalCreateSchema,
  journalUpdateSchema,
  type JournalCreateInput,
  type JournalUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { JournalsService } from "./journals.service";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const listJournalsQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  dateTo: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
});

type ListJournalsQuery = z.infer<typeof listJournalsQuerySchema>;

@Controller("journals")
@UseGuards(JwtAuthGuard, RbacGuard)
export class JournalsController {
  constructor(private readonly journals: JournalsService) {}

  @Get()
  @RequirePermissions(Permissions.JOURNAL_READ)
  listJournals(@Query(new ZodValidationPipe(listJournalsQuerySchema)) query: ListJournalsQuery) {
    const orgId = RequestContext.get()?.orgId;
    const { search, ...rest } = query;
    const q = query.q ?? search;
    return this.journals.listJournals(orgId, { ...rest, q });
  }

  @Get(":id")
  @RequirePermissions(Permissions.JOURNAL_READ)
  getJournal(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.journals.getJournal(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.JOURNAL_WRITE)
  createJournal(
    @Body(new ZodValidationPipe(journalCreateSchema)) body: JournalCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.journals.createJournal(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.JOURNAL_WRITE)
  updateJournal(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(journalUpdateSchema)) body: JournalUpdateInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.journals.updateJournal(orgId, id, actorUserId, body);
  }

  @Post(":id/post")
  @RequirePermissions(Permissions.JOURNAL_POST)
  postJournal(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.journals.postJournal(orgId, id, actorUserId, idempotencyKey);
  }

  @Post(":id/void")
  @RequirePermissions(Permissions.JOURNAL_POST)
  voidJournal(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.journals.voidJournal(orgId, id, actorUserId, idempotencyKey);
  }
}
