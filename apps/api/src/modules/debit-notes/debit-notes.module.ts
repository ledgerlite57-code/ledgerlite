import { Module } from "@nestjs/common";
import { DebitNotesController } from "./debit-notes.controller";
import { DebitNotesService } from "./debit-notes.service";
import { DebitNotesRepository } from "./debit-notes.repo";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [DebitNotesController],
  providers: [DebitNotesService, DebitNotesRepository],
})
export class DebitNotesModule {}
