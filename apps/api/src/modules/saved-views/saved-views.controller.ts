import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  Permissions,
  savedViewCreateSchema,
  savedViewListQuerySchema,
  savedViewUpdateSchema,
  type SavedViewCreateInput,
  type SavedViewListQuery,
  type SavedViewUpdateInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { SavedViewsService } from "./saved-views.service";

@Controller("saved-views")
@UseGuards(JwtAuthGuard, RbacGuard)
export class SavedViewsController {
  constructor(private readonly savedViews: SavedViewsService) {}

  @Get()
  @RequirePermissions(Permissions.ORG_READ)
  listSavedViews(@Query(new ZodValidationPipe(savedViewListQuerySchema)) query: SavedViewListQuery) {
    const orgId = RequestContext.get()?.orgId;
    const userId = RequestContext.get()?.userId;
    return this.savedViews.listSavedViews(orgId, userId, query.entityType);
  }

  @Post()
  @RequirePermissions(Permissions.ORG_READ)
  createSavedView(@Body(new ZodValidationPipe(savedViewCreateSchema)) body: SavedViewCreateInput) {
    const orgId = RequestContext.get()?.orgId;
    const userId = RequestContext.get()?.userId;
    return this.savedViews.createSavedView(orgId, userId, body);
  }

  @Patch(":id")
  @RequirePermissions(Permissions.ORG_READ)
  updateSavedView(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(savedViewUpdateSchema)) body: SavedViewUpdateInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const userId = RequestContext.get()?.userId;
    return this.savedViews.updateSavedView(orgId, userId, id, body);
  }

  @Delete(":id")
  @RequirePermissions(Permissions.ORG_READ)
  deleteSavedView(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    const userId = RequestContext.get()?.userId;
    return this.savedViews.deleteSavedView(orgId, userId, id);
  }
}
