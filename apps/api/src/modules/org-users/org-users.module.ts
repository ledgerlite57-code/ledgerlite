import { Module } from "@nestjs/common";
import { OrgUsersController } from "./org-users.controller";
import { OrgUsersService } from "./org-users.service";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";

@Module({
  imports: [AuthModule, RbacModule, CommonModule],
  controllers: [OrgUsersController],
  providers: [OrgUsersService],
})
export class OrgUsersModule {}
