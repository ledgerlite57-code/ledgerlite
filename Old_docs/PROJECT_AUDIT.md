# Project Audit: LedgerLite

## 1) Repo structure
- apps/
  - api: NestJS API service (REST, Prisma, auth, RBAC) in `apps/api`
  - web: Next.js App Router UI in `apps/web`
- packages/
  - shared: shared Zod schemas, permissions, types in `packages/shared`
  - config: placeholder package in `packages/config`

## 2) Tech stack summary
- Backend framework: NestJS in `apps/api`
- ORM + DB: Prisma + PostgreSQL in `apps/api/prisma/schema.prisma`
- Auth: JWT access tokens + refresh tokens (refresh stored hashed in DB, cookie-based) in `apps/api/src/auth/auth.controller.ts` and `apps/api/src/auth/auth.service.ts`
- Logging/observability: pino-http request logging + AsyncLocalStorage request context in `apps/api/src/logging/http-logger.middleware.ts` and `apps/api/src/logging/request-context.middleware.ts`, Sentry in `apps/api/src/main.ts` and `apps/web/sentry.client.config.ts`
- UI library: Next.js + React, Tailwind CSS, Radix UI, react-hook-form, Zod in `apps/web/package.json`

## 3) Domain modules & features currently implemented

### Organization setup
- UI routes: `/dashboard` (org setup + tabs) in `apps/web/app/(protected)/dashboard/page.tsx` and `apps/web/src/features/dashboard/dashboard-page.tsx`
- API endpoints: `OrgController` in `apps/api/src/modules/orgs/orgs.controller.ts` -> POST /orgs, GET /orgs/current, PATCH /orgs/current, GET /orgs/roles; `OrgUsersController` in `apps/api/src/modules/org-users/org-users.controller.ts` -> GET /orgs/users, POST /orgs/users/invite, POST /orgs/users/invite/accept, PATCH /orgs/users/:id
- DB models: Organization, OrgSettings, Role, Permission, RolePermission, Membership, Invite, User, AuditLog, IdempotencyKey in `apps/api/prisma/schema.prisma`

### Chart of accounts
- UI routes: `/dashboard?tab=accounts` in `apps/web/app/(protected)/dashboard/page.tsx` and `apps/web/src/features/dashboard/dashboard-sections.tsx`
- API endpoints: `AccountsController` in `apps/api/src/modules/accounts/accounts.controller.ts` -> GET /accounts, POST /accounts, PATCH /accounts/:id
- DB models: Account, OrgSettings, AuditLog, IdempotencyKey in `apps/api/prisma/schema.prisma`

### Customers
- UI routes: `/dashboard?tab=customers` in `apps/web/app/(protected)/dashboard/page.tsx` and `apps/web/src/features/dashboard/dashboard-sections.tsx`
- API endpoints: `CustomersController` in `apps/api/src/modules/customers/customers.controller.ts` -> GET /customers, GET /customers/:id, POST /customers, PATCH /customers/:id
- DB models: Customer, AuditLog, IdempotencyKey in `apps/api/prisma/schema.prisma`

### Vendors
- UI routes: `/dashboard?tab=vendors` in `apps/web/app/(protected)/dashboard/page.tsx` and `apps/web/src/features/dashboard/dashboard-sections.tsx`
- API endpoints: `VendorsController` in `apps/api/src/modules/vendors/vendors.controller.ts` -> GET /vendors, GET /vendors/:id, POST /vendors, PATCH /vendors/:id
- DB models: Vendor, AuditLog, IdempotencyKey in `apps/api/prisma/schema.prisma`

### Items
- UI routes: `/dashboard?tab=items` in `apps/web/app/(protected)/dashboard/page.tsx` and `apps/web/src/features/dashboard/dashboard-sections.tsx`
- API endpoints: `ItemsController` in `apps/api/src/modules/items/items.controller.ts` -> GET /items, GET /items/:id, POST /items, PATCH /items/:id
- DB models: Item, Account, TaxCode, AuditLog, IdempotencyKey in `apps/api/prisma/schema.prisma`

### Invoices + lines
- UI routes: `/invoices` in `apps/web/app/(protected)/invoices/page.tsx`, `/invoices/[id]` in `apps/web/app/(protected)/invoices/[id]/page.tsx`
- API endpoints: `InvoicesController` in `apps/api/src/modules/invoices/invoices.controller.ts` -> GET /invoices, GET /invoices/:id, POST /invoices, PATCH /invoices/:id, POST /invoices/:id/post
- DB models: Invoice, InvoiceLine, GLHeader, GLLine, OrgSettings, TaxCode, Account, Customer, AuditLog, IdempotencyKey in `apps/api/prisma/schema.prisma`

### Bills/expenses + lines
- UI routes: `/bills` in `apps/web/app/(protected)/bills/page.tsx`, `/bills/[id]` in `apps/web/app/(protected)/bills/[id]/page.tsx`
- API endpoints: `BillsController` in `apps/api/src/modules/bills/bills.controller.ts` -> GET /bills, GET /bills/:id, POST /bills, PATCH /bills/:id, POST /bills/:id/post
- DB models: Bill, BillLine, GLHeader, GLLine, OrgSettings, TaxCode, Account, Vendor, AuditLog, IdempotencyKey in `apps/api/prisma/schema.prisma`

### Payments received
- UI routes: `/payments-received` in `apps/web/app/(protected)/payments-received/page.tsx`, `/payments-received/[id]` in `apps/web/app/(protected)/payments-received/[id]/page.tsx`
- API endpoints: `PaymentsReceivedController` in `apps/api/src/modules/payments-received/payments-received.controller.ts` -> GET /payments-received, GET /payments-received/:id, POST /payments-received, PATCH /payments-received/:id, POST /payments-received/:id/post
- DB models: PaymentReceived, PaymentReceivedAllocation, Invoice, BankAccount, Account, GLHeader, GLLine, AuditLog, IdempotencyKey in `apps/api/prisma/schema.prisma`

### Vendor payments
- UI routes: `/vendor-payments` in `apps/web/app/(protected)/vendor-payments/page.tsx`, `/vendor-payments/[id]` in `apps/web/app/(protected)/vendor-payments/[id]/page.tsx`
- API endpoints: `VendorPaymentsController` in `apps/api/src/modules/vendor-payments/vendor-payments.controller.ts` -> GET /vendor-payments, GET /vendor-payments/:id, POST /vendor-payments, PATCH /vendor-payments/:id, POST /vendor-payments/:id/post
- DB models: VendorPayment, VendorPaymentAllocation, Bill, BankAccount, Account, GLHeader, GLLine, AuditLog, IdempotencyKey in `apps/api/prisma/schema.prisma`

### Journal entries
- UI routes: `/journals` in `apps/web/app/(protected)/journals/page.tsx`, `/journals/[id]` in `apps/web/app/(protected)/journals/[id]/page.tsx`
- API endpoints: `JournalsController` in `apps/api/src/modules/journals/journals.controller.ts` -> GET /journals, GET /journals/:id, POST /journals, PATCH /journals/:id, POST /journals/:id/post
- DB models: JournalEntry, JournalLine, Account, GLHeader, GLLine, AuditLog, IdempotencyKey in `apps/api/prisma/schema.prisma`

### VAT / tax codes
- UI routes: `/dashboard?tab=taxes` in `apps/web/app/(protected)/dashboard/page.tsx` and `apps/web/src/features/dashboard/dashboard-sections.tsx`
- API endpoints: `TaxCodesController` in `apps/api/src/modules/tax-codes/tax-codes.controller.ts` -> GET /tax-codes, GET /tax-codes/:id, POST /tax-codes, PATCH /tax-codes/:id
- DB models: TaxCode, Account, AuditLog, IdempotencyKey in `apps/api/prisma/schema.prisma`

### Reports (trial balance, ledger, P&L, balance sheet, VAT, aging)
- UI routes: `/reports` in `apps/web/app/(protected)/reports/page.tsx`; `/reports/trial-balance` in `apps/web/app/(protected)/reports/trial-balance/page.tsx`; `/reports/profit-loss` in `apps/web/app/(protected)/reports/profit-loss/page.tsx`; `/reports/balance-sheet` in `apps/web/app/(protected)/reports/balance-sheet/page.tsx`; `/reports/ar-aging` in `apps/web/app/(protected)/reports/ar-aging/page.tsx`; `/reports/ap-aging` in `apps/web/app/(protected)/reports/ap-aging/page.tsx`; `/reports/vat-summary` in `apps/web/app/(protected)/reports/vat-summary/page.tsx`
- API endpoints: `ReportsController` in `apps/api/src/modules/reports/reports.controller.ts` -> GET /reports/trial-balance, /reports/profit-loss, /reports/balance-sheet, /reports/ar-aging, /reports/ap-aging, /reports/vat-summary, /reports/ledger-lines
- DB models: GLHeader, GLLine, Account, Invoice, Bill, PaymentReceivedAllocation, VendorPaymentAllocation in `apps/api/prisma/schema.prisma`

### Audit log
- UI routes: `/settings/audit-log` in `apps/web/app/(protected)/settings/audit-log/page.tsx`
- API endpoints: `AuditLogsController` in `apps/api/src/modules/audit-logs/audit-logs.controller.ts` -> GET /audit-logs
- DB models: AuditLog, User in `apps/api/prisma/schema.prisma`

### Other implemented modules (not in requested list)
- Bank accounts, bank transaction import, reconciliation sessions in `apps/api/src/modules/bank-accounts`, `apps/api/src/modules/bank-transactions`, `apps/api/src/modules/reconciliation-sessions`; UI routes in `apps/web/app/(protected)/bank-accounts/page.tsx`, `apps/web/app/(protected)/bank-transactions/import/page.tsx`, `apps/web/app/(protected)/reconciliation/page.tsx`

## 4) Ledger & posting design
- Ledger storage: GL headers and lines in `apps/api/prisma/schema.prisma` (models GLHeader, GLLine with unique sourceType + sourceId)
- Posting entry points: `postInvoice`, `postBill`, `postPayment`, `postPayment` (vendor), `postJournal` in `apps/api/src/modules/invoices/invoices.service.ts`, `apps/api/src/modules/bills/bills.service.ts`, `apps/api/src/modules/payments-received/payments-received.service.ts`, `apps/api/src/modules/vendor-payments/vendor-payments.service.ts`, `apps/api/src/modules/journals/journals.service.ts`
- Posting engine layer: domain-specific utilities `apps/api/src/invoices.utils.ts`, `apps/api/src/bills.utils.ts`, `apps/api/src/payments-received.utils.ts`, `apps/api/src/vendor-payments.utils.ts`, `apps/api/src/journals.utils.ts`
- Balancing validation: `eq` checks on total debit/credit in posting flows and `ensureValidJournalLines` + `calculateJournalTotals` in `apps/api/src/journals.utils.ts`
- VAT calculation/rounding: line-level VAT in `apps/api/src/invoices.utils.ts` and `apps/api/src/bills.utils.ts` using `round2` (HALF_UP) in `apps/api/src/common/money.ts`
- Posting references/idempotency: `GLHeader` sourceType/sourceId uniqueness in `apps/api/prisma/schema.prisma`; idempotency keys stored in `IdempotencyKey` with requestHash/response in `apps/api/prisma/schema.prisma` and `apps/api/src/common/idempotency.ts`
- Posted editability: update paths reject non-DRAFT documents in service layer (e.g., `apps/api/src/modules/invoices/invoices.service.ts`); void/reversal endpoints are Not found

## 5) Money math correctness check
- Server-side arithmetic uses Prisma Decimal and `round2` in `apps/api/src/common/money.ts`, and is used consistently in posting utilities in `apps/api/src/invoices.utils.ts`, `apps/api/src/bills.utils.ts`, `apps/api/src/payments-received.utils.ts`, `apps/api/src/vendor-payments.utils.ts`, `apps/api/src/journals.utils.ts`
- Floating-point usage on server is limited to rate conversion (e.g., `Number(tax.rate)` in `apps/api/src/modules/invoices/invoices.service.ts` and `apps/api/src/modules/bills/bills.service.ts`)
- Risky UI previews use JS floats and Math.round in `apps/web/app/(protected)/invoices/[id]/page.tsx`, `apps/web/app/(protected)/bills/[id]/page.tsx`, `apps/web/app/(protected)/payments-received/[id]/page.tsx`, `apps/web/app/(protected)/vendor-payments/[id]/page.tsx`, `apps/web/app/(protected)/journals/[id]/page.tsx`, and formatting casts in `apps/web/src/lib/format.ts`
- Recommended fix: keep UI totals read-only from server where possible, or use a decimal library/minor units in UI calculations to avoid drift

## 6) Auth/session security check
- Access token storage: in-memory variable in `apps/web/src/lib/auth.ts`, set on login in `apps/web/app/login/page.tsx`
- Refresh token storage: httpOnly cookie `refresh_token` (sameSite=lax, secure in production, path `/auth`) in `apps/api/src/auth/auth.controller.ts`
- Refresh flow: hashed refresh tokens stored in DB and rotated on refresh/logout in `apps/api/src/auth/auth.service.ts`
- Risks: default owner credentials enabled outside production in `apps/api/src/auth/auth.service.ts`; access token is JS-accessible (XSS risk); refresh is cookie-based without explicit CSRF token (sameSite=lax only); JWT verification does not set aud/iss checks
- Not found: explicit CSRF protection or device/session binding

## 7) Data integrity constraints
- Key unique constraints: Account (orgId+code), Role (orgId+name), TaxCode (orgId+name), Invoice (orgId+number), PaymentReceived (orgId+number), VendorPayment (orgId+number), JournalEntry (orgId+number), GLHeader (orgId+sourceType+sourceId), IdempotencyKey (orgId+key), BankAccount (orgId+name), ReconciliationSession (orgId+bankAccountId+periodStart+periodEnd) in `apps/api/prisma/schema.prisma`
- Not found: unique constraint on Bill billNumber/systemNumber in `apps/api/prisma/schema.prisma`
- Foreign keys/deletion: most parent relations use Restrict; line/allocations use Cascade; optional references use SetNull (all in `apps/api/prisma/schema.prisma`)
- Soft delete: `isActive` flags on Account, Customer, Vendor, Item, TaxCode, BankAccount; posted docs are prevented from edits in services

## 8) Reporting correctness check
- Ledger-based reports: Trial Balance, P&L, Balance Sheet, VAT Summary, Ledger Lines use `GLLine.groupBy` and `GLLine.findMany` with `GLHeader.postingDate` filters in `apps/api/src/modules/reports/reports.service.ts`
- Aging reports: AR/AP aging use `Invoice`/`Bill` with allocation tables (PaymentReceivedAllocation/VendorPaymentAllocation) in `apps/api/src/modules/reports/reports.service.ts`, not derived from GL
- Existing report queries: trial balance, profit-loss, balance-sheet, ar-aging, ap-aging, vat-summary, ledger-lines in `apps/api/src/modules/reports/reports.service.ts` and UI pages in `apps/web/app/(protected)/reports/*/page.tsx`

## 9) Test coverage
- API: e2e/integration in `apps/api/test` (auth, health, phases 1-5), unit tests for posting/utils in `apps/api/src/*utils.spec.ts`
- Web: Playwright specs in `apps/web/tests` (auth + phases 1-3)
- Missing/critical: no e2e for phases 6-9 (vendor payments, journals, bank/reconciliation, reports, audit log), no report API correctness tests, no idempotency conflict tests, and no void/reversal tests (feature not implemented)

## 10) Top 15 improvements (prioritized)
1) Implement void/reversal workflows for posted docs + GL reversals (correctness) in `apps/api/src/modules/*`
2) Add DB-level immutability safeguards for posted documents and GL rows (correctness) in `apps/api/prisma/schema.prisma`
3) Add unique constraints for Bill numbers (orgId + billNumber/systemNumber) (correctness) in `apps/api/prisma/schema.prisma`
4) Add report correctness test suite for TB/P&L/BS/VAT/Aging + ledger drilldown (correctness) in `apps/api/test`
5) Add e2e coverage for phases 6-9 (vendor payments, journals, bank/reconciliation, reports, audit log) in `apps/api/test` and `apps/web/tests`
6) Add CSRF protections for refresh cookie endpoints and tighten cookie policy where possible (security) in `apps/api/src/auth/auth.controller.ts`
7) Remove or explicitly gate default owner credentials with a dedicated env flag and audit usage (security) in `apps/api/src/auth/auth.service.ts`
8) Add refresh token reuse detection and token family revocation (security) in `apps/api/src/auth/auth.service.ts`
9) Replace client-side float math previews with decimal/minor unit helpers or server totals (correctness/UX) in `apps/web/app/(protected)/*/[id]/page.tsx`
10) Capture ip/userAgent in audit logs (security/compliance) in `apps/api/src/common/audit.service.ts`
11) Add composite indexes for report queries and monitor slow queries (performance) in `apps/api/prisma/schema.prisma`
12) Consolidate posting logic into a shared domain service to reduce duplication across modules (architecture) in `apps/api/src`
13) Add currency/exchange-rate consistency checks between documents and GL headers (correctness) in `apps/api/src/modules/*`
14) Add reconciliation unmatch flows and stronger import dedupe tests (correctness/UX) in `apps/api/src/modules/reconciliation-sessions` and `apps/api/src/modules/bank-transactions`
15) Implement CSV/PDF exports and improve report filter UX (UX) in `apps/web/app/(protected)/reports/*/page.tsx`
