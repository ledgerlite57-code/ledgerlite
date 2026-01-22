import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";
import { BankTransactionsController } from "./bank-transactions.controller";
import { BankTransactionsService } from "./bank-transactions.service";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [BankTransactionsController],
  providers: [BankTransactionsService],
})
export class BankTransactionsModule {}
