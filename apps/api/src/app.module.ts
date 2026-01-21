import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { AuditService } from "./common/audit.service";
import { RbacGuard } from "./rbac/rbac.guard";
import { OrgController } from "./orgs.controller";
import { OrgService } from "./orgs.service";
import { AccountsController } from "./accounts.controller";
import { AccountsService } from "./accounts.service";
import { OrgUsersController } from "./org-users.controller";
import { OrgUsersService } from "./org-users.service";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { VendorsController } from "./vendors.controller";
import { VendorsService } from "./vendors.service";
import { ItemsController } from "./items.controller";
import { ItemsService } from "./items.service";
import { TaxCodesController } from "./tax-codes.controller";
import { TaxCodesService } from "./tax-codes.service";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), JwtModule.register({}), PrismaModule, AuthModule, HealthModule],
  controllers: [
    OrgController,
    AccountsController,
    OrgUsersController,
    CustomersController,
    VendorsController,
    ItemsController,
    TaxCodesController,
    InvoicesController,
  ],
  providers: [
    OrgService,
    AccountsService,
    OrgUsersService,
    CustomersService,
    VendorsService,
    ItemsService,
    TaxCodesService,
    InvoicesService,
    AuditService,
    RbacGuard,
  ],
})
export class AppModule {}
