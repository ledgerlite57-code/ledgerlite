import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  Permissions,
  unitOfMeasureCreateSchema,
  unitOfMeasureUpdateSchema,
  type UnitOfMeasureCreateInput,
  type UnitOfMeasureUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { UnitsOfMeasurementService } from "./units-of-measurement.service";

@Controller("units-of-measurement")
@UseGuards(JwtAuthGuard, RbacGuard)
export class UnitsOfMeasurementController {
  constructor(private readonly units: UnitsOfMeasurementService) {}

  @Get()
  @RequirePermissions(Permissions.ITEM_READ)
  listUnits(@Query("search") search?: string, @Query("isActive") isActive?: string) {
    const orgId = RequestContext.get()?.orgId;
    const active = isActive === "true" ? true : isActive === "false" ? false : undefined;
    return this.units.listUnits(orgId, search, active);
  }

  @Get(":id")
  @RequirePermissions(Permissions.ITEM_READ)
  getUnit(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.units.getUnit(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.ITEM_WRITE)
  createUnit(
    @Body(new ZodValidationPipe(unitOfMeasureCreateSchema)) body: UnitOfMeasureCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.units.createUnit(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.ITEM_WRITE)
  updateUnit(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(unitOfMeasureUpdateSchema)) body: UnitOfMeasureUpdateInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.units.updateUnit(orgId, id, actorUserId, body);
  }
}
