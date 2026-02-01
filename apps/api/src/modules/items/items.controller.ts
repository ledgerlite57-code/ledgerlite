import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  Permissions,
  itemCreateSchema,
  itemUpdateSchema,
  paginationSchema,
  type ItemCreateInput,
  type ItemUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { ItemsService } from "./items.service";

const parseBoolean = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return value;
};

const listItemsQuerySchema = paginationSchema.extend({
  isActive: z.preprocess(parseBoolean, z.boolean().optional()),
  search: z.string().optional(),
});

type ListItemsQuery = z.infer<typeof listItemsQuerySchema>;

@Controller("items")
@UseGuards(JwtAuthGuard, RbacGuard)
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  @RequirePermissions(Permissions.ITEM_READ)
  listItems(@Query(new ZodValidationPipe(listItemsQuerySchema)) query: ListItemsQuery) {
    const orgId = RequestContext.get()?.orgId;
    const { search, ...rest } = query;
    const q = query.q ?? search;
    return this.items.listItems(orgId, { ...rest, q });
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
