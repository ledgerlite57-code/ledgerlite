import { Module } from "@nestjs/common";
import { OpeningBalancesController } from "./opening-balances.controller";
import { OpeningBalancesService } from "./opening-balances.service";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [OpeningBalancesController],
  providers: [OpeningBalancesService],
})
export class OpeningBalancesModule {}
