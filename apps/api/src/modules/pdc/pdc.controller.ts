import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  Permissions,
  pdcCreateSchema,
  pdcUpdateSchema,
  type PdcCreateInput,
  type PdcUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { PdcService } from "./pdc.service";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const listPdcQuerySchema = z.object({
  q: z.preprocess(emptyToUndefined, z.string().optional()),
  search: z.preprocess(emptyToUndefined, z.string().optional()),
  status: z.preprocess(emptyToUndefined, z.string().optional()),
  direction: z.preprocess(emptyToUndefined, z.string().optional()),
  customerId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  vendorId: z.preprocess(emptyToUndefined, z.string().uuid().optional()),
  dateFrom: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  dateTo: z.preprocess(emptyToUndefined, z.coerce.date().optional()),
  amountMin: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
  amountMax: z.preprocess(emptyToUndefined, z.coerce.number().min(0).optional()),
});

type ListPdcQuery = z.infer<typeof listPdcQuerySchema>;

@Controller("pdc")
@UseGuards(JwtAuthGuard, RbacGuard)
export class PdcController {
  constructor(private readonly pdc: PdcService) {}

  @Get()
  @RequirePermissions(Permissions.PDC_READ)
  listPdc(@Query(new ZodValidationPipe(listPdcQuerySchema)) query: ListPdcQuery) {
    const orgId = RequestContext.get()?.orgId;
    const q = query.q ?? query.search;
    return this.pdc.listPdc(orgId, {
      q,
      status: query.status,
      direction: query.direction,
      customerId: query.customerId,
      vendorId: query.vendorId,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      amountMin: query.amountMin,
      amountMax: query.amountMax,
    });
  }

  @Get(":id")
  @RequirePermissions(Permissions.PDC_READ)
  getPdc(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.pdc.getPdc(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.PDC_WRITE)
  createPdc(
    @Body(new ZodValidationPipe(pdcCreateSchema)) body: PdcCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.pdc.createPdc(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.PDC_WRITE)
  updatePdc(@Param("id") id: string, @Body(new ZodValidationPipe(pdcUpdateSchema)) body: PdcUpdateInput) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.pdc.updatePdc(orgId, id, actorUserId, body);
  }

  @Post(":id/schedule")
  @RequirePermissions(Permissions.PDC_WRITE)
  schedulePdc(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.pdc.schedulePdc(orgId, id, actorUserId);
  }

  @Post(":id/deposit")
  @RequirePermissions(Permissions.PDC_WRITE)
  depositPdc(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.pdc.depositPdc(orgId, id, actorUserId);
  }

  @Post(":id/clear")
  @RequirePermissions(Permissions.PDC_POST)
  clearPdc(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.pdc.clearPdc(orgId, id, actorUserId, idempotencyKey);
  }

  @Post(":id/bounce")
  @RequirePermissions(Permissions.PDC_POST)
  bouncePdc(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.pdc.bouncePdc(orgId, id, actorUserId, idempotencyKey);
  }

  @Post(":id/cancel")
  @RequirePermissions(Permissions.PDC_WRITE)
  cancelPdc(@Param("id") id: string, @Headers("idempotency-key") idempotencyKey?: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.pdc.cancelPdc(orgId, id, actorUserId, idempotencyKey);
  }
}
