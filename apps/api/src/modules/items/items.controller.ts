import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  Permissions,
  itemCreateSchema,
  itemUpdateSchema,
  type ItemCreateInput,
  type ItemUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { ItemsService } from "./items.service";

@Controller("items")
@UseGuards(JwtAuthGuard, RbacGuard)
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @RequirePermissions(Permissions.ITEM_READ)
  listItems(@Query("search") search?: string, @Query("isActive") isActive?: string) {
    const orgId = RequestContext.get()?.orgId;
    const active = isActive === "true" ? true : isActive === "false" ? false : undefined;
    return this.items.listItems(orgId, search, active);
  }

  @Get(":id")
  @RequirePermissions(Permissions.ITEM_READ)
  getItem(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    return this.items.getItem(orgId, id);
  }

  @Post()
  @RequirePermissions(Permissions.ITEM_WRITE)
  createItem(
    @Body(new ZodValidationPipe(itemCreateSchema)) body: ItemCreateInput,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.items.createItem(orgId, actorUserId, body, idempotencyKey);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.ITEM_WRITE)
  updateItem(@Param("id") id: string, @Body(new ZodValidationPipe(itemUpdateSchema)) body: ItemUpdateInput) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.items.updateItem(orgId, id, actorUserId, body);
  }
}
