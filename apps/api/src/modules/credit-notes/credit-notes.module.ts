import { Module } from "@nestjs/common";
import { CreditNotesController } from "./credit-notes.controller";
import { CreditNotesService } from "./credit-notes.service";
import { CreditNotesRepository } from "./credit-notes.repo";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [CreditNotesController],
  providers: [CreditNotesService, CreditNotesRepository],
})
export class CreditNotesModule {}
