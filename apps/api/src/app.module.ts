import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
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
import { PaymentsReceivedController } from "./payments-received.controller";
import { PaymentsReceivedService } from "./payments-received.service";
import { BankAccountsController } from "./bank-accounts.controller";
import { BankAccountsService } from "./bank-accounts.service";
import { BillsController } from "./bills.controller";
import { BillsService } from "./bills.service";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({}),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: "default",
          ttl: 60,
          limit: 100,
        },
      ],
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
  ],
  controllers: [
    OrgController,
    AccountsController,
    OrgUsersController,
    CustomersController,
    VendorsController,
    ItemsController,
    TaxCodesController,
    InvoicesController,
    PaymentsReceivedController,
    BankAccountsController,
    BillsController,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    OrgService,
    AccountsService,
    OrgUsersService,
    CustomersService,
    VendorsService,
    ItemsService,
    TaxCodesService,
    InvoicesService,
    PaymentsReceivedService,
    BankAccountsService,
    BillsService,
    AuditService,
    RbacGuard,
  ],
})
export class AppModule {}
