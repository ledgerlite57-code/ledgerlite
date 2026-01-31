import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  Permissions,
  attachmentCreateSchema,
  attachmentListSchema,
  type AttachmentCreateInput,
  type AttachmentListInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { AttachmentsService } from "./attachments.service";

@Controller("attachments")
@UseGuards(JwtAuthGuard, RbacGuard)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get()
  @RequirePermissions(Permissions.ORG_READ)
  listAttachments(@Query(new ZodValidationPipe(attachmentListSchema)) query: AttachmentListInput) {
    const orgId = RequestContext.get()?.orgId;
    return this.attachments.listAttachments(orgId, query.entityType, query.entityId);
  }

  @Post()
  @RequirePermissions(Permissions.ORG_READ)
  createAttachment(@Body(new ZodValidationPipe(attachmentCreateSchema)) body: AttachmentCreateInput) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.attachments.createAttachment(orgId, actorUserId, body);
  }

  @Delete(":id")
  @RequirePermissions(Permissions.ORG_READ)
  deleteAttachment(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.attachments.deleteAttachment(orgId, id, actorUserId);
  }
}
