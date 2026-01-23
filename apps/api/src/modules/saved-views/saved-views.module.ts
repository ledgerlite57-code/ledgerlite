import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RbacModule } from "../../rbac/rbac.module";
import { SavedViewsController } from "./saved-views.controller";
import { SavedViewsService } from "./saved-views.service";

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [SavedViewsController],
  providers: [SavedViewsService],
})
export class SavedViewsModule {}
