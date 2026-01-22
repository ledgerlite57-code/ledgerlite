import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";
import { ReconciliationSessionsController } from "./reconciliation-sessions.controller";
import { ReconciliationSessionsService } from "./reconciliation-sessions.service";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [ReconciliationSessionsController],
  providers: [ReconciliationSessionsService],
})
export class ReconciliationSessionsModule {}
