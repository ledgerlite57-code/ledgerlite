import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";
import { UnitsOfMeasurementController } from "./units-of-measurement.controller";
import { UnitsOfMeasurementService } from "./units-of-measurement.service";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [UnitsOfMeasurementController],
  providers: [UnitsOfMeasurementService],
})
export class UnitsOfMeasurementModule {}
