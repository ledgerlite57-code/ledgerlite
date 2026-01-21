import { Module } from "@nestjs/common";
import { OrgController } from "./orgs.controller";
import { OrgService } from "./orgs.service";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [OrgController],
  providers: [OrgService],
})
export class OrgsModule {}
