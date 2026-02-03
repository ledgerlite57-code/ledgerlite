import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AccountsModule } from "./modules/accounts/accounts.module";
import { AuditLogsModule } from "./modules/audit-logs/audit-logs.module";
import { BankAccountsModule } from "./modules/bank-accounts/bank-accounts.module";
import { BankTransactionsModule } from "./modules/bank-transactions/bank-transactions.module";
import { BillsModule } from "./modules/bills/bills.module";
import { CreditNotesModule } from "./modules/credit-notes/credit-notes.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { ExpensesModule } from "./modules/expenses/expenses.module";
import { InvoicesModule } from "./modules/invoices/invoices.module";
import { ItemsModule } from "./modules/items/items.module";
import { JournalsModule } from "./modules/journals/journals.module";
import { OrgUsersModule } from "./modules/org-users/org-users.module";
import { OrgsModule } from "./modules/orgs/orgs.module";
import { PaymentsReceivedModule } from "./modules/payments-received/payments-received.module";
import { ReconciliationSessionsModule } from "./modules/reconciliation-sessions/reconciliation-sessions.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { SavedViewsModule } from "./modules/saved-views/saved-views.module";
import { TaxCodesModule } from "./modules/tax-codes/tax-codes.module";
import { UnitsOfMeasurementModule } from "./modules/units-of-measurement/units-of-measurement.module";
import { VendorsModule } from "./modules/vendors/vendors.module";
import { VendorPaymentsModule } from "./modules/vendor-payments/vendor-payments.module";
import { AttachmentsModule } from "./modules/attachments/attachments.module";
import { PdcModule } from "./modules/pdc/pdc.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
    AccountsModule,
    AuditLogsModule,
    BankAccountsModule,
    BankTransactionsModule,
    BillsModule,
    CreditNotesModule,
    CustomersModule,
    DashboardModule,
    ExpensesModule,
    InvoicesModule,
    ItemsModule,
    JournalsModule,
    OrgsModule,
    OrgUsersModule,
    PaymentsReceivedModule,
    ReconciliationSessionsModule,
    ReportsModule,
    SavedViewsModule,
    TaxCodesModule,
    UnitsOfMeasurementModule,
    VendorsModule,
    VendorPaymentsModule,
    AttachmentsModule,
    PdcModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
