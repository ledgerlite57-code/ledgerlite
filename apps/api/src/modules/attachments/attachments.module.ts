import { Module } from "@nestjs/common";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { AttachmentsStorageService } from "./attachments.storage";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentsStorageService],
})
export class AttachmentsModule {}
