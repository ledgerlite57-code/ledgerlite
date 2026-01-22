import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  Permissions,
  paginationSchema,
  reconciliationCloseSchema,
  reconciliationMatchSchema,
  reconciliationSessionCreateSchema,
  type ReconciliationCloseInput,
  type ReconciliationMatchInput,
  type ReconciliationSessionCreateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { ReconciliationSessionsService } from "./reconciliation-sessions.service";

const listSessionsQuerySchema = paginationSchema.extend({
  bankAccountId: z.string().optional(),
  status: z.string().optional(),
});

type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;

@Controller("reconciliation-sessions")
@UseGuards(JwtAuthGuard, RbacGuard)
export class ReconciliationSessionsController {
  constructor(private readonly reconciliation: ReconciliationSessionsService) {}

  @Get()
  @RequirePermissions(Permissions.RECONCILE_MANAGE)
  listSessions(@Query(new ZodValidationPipe(listSessionsQuerySchema)) query: ListSessionsQuery) {
    const orgId = RequestContext.get()?.orgId;
    return this.reconciliation.listSessions(orgId, query);
  }

  @Get(":id")
  @RequirePermissions(Permissions.RECONCILE_MANAGE)
  getSession(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.reconciliation.getSession(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.RECONCILE_MANAGE)
  createSession(
    @Body(new ZodValidationPipe(reconciliationSessionCreateSchema)) body: ReconciliationSessionCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.reconciliation.createSession(orgId, actorUserId, body, idempotencyKey);
  }

  @Post(":id/match")
  @RequirePermissions(Permissions.RECONCILE_MANAGE)
  matchTransaction(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reconciliationMatchSchema)) body: ReconciliationMatchInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.reconciliation.matchTransaction(orgId, id, actorUserId, body);
  }

  @Post(":id/close")
  @RequirePermissions(Permissions.RECONCILE_MANAGE)
  closeSession(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reconciliationCloseSchema)) body: ReconciliationCloseInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.reconciliation.closeSession(orgId, id, actorUserId, body);
  }
}
