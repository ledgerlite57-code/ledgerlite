import { Module } from "@nestjs/common";
import { BankAccountsController } from "./bank-accounts.controller";
import { BankAccountsService } from "./bank-accounts.service";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [BankAccountsController],
  providers: [BankAccountsService],
})
export class BankAccountsModule {}
