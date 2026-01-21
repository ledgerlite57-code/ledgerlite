import { Module } from "@nestjs/common";
import { PaymentsReceivedController } from "./payments-received.controller";
import { PaymentsReceivedService } from "./payments-received.service";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [PaymentsReceivedController],
  providers: [PaymentsReceivedService],
})
export class PaymentsReceivedModule {}
