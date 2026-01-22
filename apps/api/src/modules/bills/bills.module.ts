import { Module } from "@nestjs/common";
import { BillsController } from "./bills.controller";
import { BillsService } from "./bills.service";
import { BillsRepository } from "./bills.repo";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [BillsController],
  providers: [BillsService, BillsRepository],
})
export class BillsModule {}
