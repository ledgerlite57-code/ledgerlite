import { Module } from "@nestjs/common";
import { VendorPaymentsController } from "./vendor-payments.controller";
import { VendorPaymentsService } from "./vendor-payments.service";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [VendorPaymentsController],
  providers: [VendorPaymentsService],
})
export class VendorPaymentsModule {}
