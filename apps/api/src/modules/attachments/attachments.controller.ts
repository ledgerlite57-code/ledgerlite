import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  Permissions,
  attachmentCreateSchema,
  attachmentListSchema,
  attachmentUploadSchema,
  type AttachmentCreateInput,
  type AttachmentListInput,
  type AttachmentUploadInput,
} from "@ledgerlite/shared";
import { JwtAuthGuard } from "../../auth/jwt-auth.guard";
import { RbacGuard } from "../../rbac/rbac.guard";
import { RequirePermissions } from "../../rbac/permissions.decorator";
import { ZodValidationPipe } from "../../common/zod-validation.pipe";
import { RequestContext } from "../../logging/request-context";
import { AttachmentsService } from "./attachments.service";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { getApiEnv } from "../../common/env";
import type { Response } from "express";

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

  @Post("upload")
  @RequirePermissions(Permissions.ORG_READ)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: getApiEnv().ATTACHMENTS_MAX_BYTES },
    }),
  )
  createAttachmentUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body(new ZodValidationPipe(attachmentUploadSchema)) body: AttachmentUploadInput,
  ) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.attachments.createAttachmentUpload(orgId, actorUserId, body, file);
  }

  @Get(":id/download")
  @RequirePermissions(Permissions.ORG_READ)
  async downloadAttachment(@Param("id") id: string, @Res({ passthrough: true }) res: Response) {
    const orgId = RequestContext.get()?.orgId;
    const { attachment, stream } = await this.attachments.downloadAttachment(orgId, id);
    if (!stream) {
      res.redirect(attachment.storageKey);
      return;
    }

    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${attachment.fileName}"`);
    return new StreamableFile(stream);
  }

  @Delete(":id")
  @RequirePermissions(Permissions.ORG_READ)
  deleteAttachment(@Param("id") id: string) {
    const orgId = RequestContext.get()?.orgId;
    const actorUserId = RequestContext.get()?.userId;
    return this.attachments.deleteAttachment(orgId, id, actorUserId);
  }
}
