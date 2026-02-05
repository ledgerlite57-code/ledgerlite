import { Module } from "@nestjs/common";
import { OrgController } from "./orgs.controller";
import { PlatformOrgsController } from "./platform-orgs.controller";
import { OrgService } from "./orgs.service";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { CommonModule } from "../../common/common.module";
import { OnboardingModule } from "../onboarding/onboarding.module";

@Module({
  imports: [AuthModule, RbacModule, CommonModule, OnboardingModule],
  controllers: [OrgController, PlatformOrgsController],
  providers: [OrgService],
})
export class OrgsModule {}
