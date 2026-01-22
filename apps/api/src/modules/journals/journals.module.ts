import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";
import { JournalsController } from "./journals.controller";
import { JournalsService } from "./journals.service";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [JournalsController],
  providers: [JournalsService],
})
export class JournalsModule {}
