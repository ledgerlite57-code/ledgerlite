import { Module } from "@nestjs/common";
import { TaxCodesController } from "./tax-codes.controller";
import { TaxCodesService } from "./tax-codes.service";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [TaxCodesController],
  providers: [TaxCodesService],
})
export class TaxCodesModule {}
