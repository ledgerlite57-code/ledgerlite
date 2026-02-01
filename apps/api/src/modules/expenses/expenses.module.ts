import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { ExpensesController } from "./expenses.controller";
import { ExpensesService } from "./expenses.service";

@Module({
  imports: [AuthModule, RbacModule, CommonModule, PrismaModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
