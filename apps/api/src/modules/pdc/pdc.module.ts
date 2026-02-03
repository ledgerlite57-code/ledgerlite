import { Module } from "@nestjs/common";
import { PdcController } from "./pdc.controller";
import { PdcService } from "./pdc.service";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [PdcController],
  providers: [PdcService],
})
export class PdcModule {}
