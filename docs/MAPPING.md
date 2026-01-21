# LedgerLite – End-to-End Mapping

This document maps **User Stories → Screens → UI Components → API Endpoints → DB Tables → Ledger Postings → Test Cases**.

Purpose:

* Make Codex generation deterministic
* Ensure nothing is missed
* Keep UI/API/DB/ledger aligned

---

## 0) Global UI Patterns (applies everywhere)

### Page template

* Header: Title + Primary Action
* Filters row: search, date range, status
* Table: TanStack Table
* Create/Edit: **Sheet (side drawer)**
* Dangerous actions: **Dialog confirmation**
* Server errors: Toast + inline field messages

### Shared components (shadcn/ui)

* `Button`, `Input`, `Select`, `Textarea`, `DatePicker`
* `Table`, `Badge`, `Tabs`
* `Dialog` (Post/Void confirmations)
* `Sheet` (Create/Edit)
* `DropdownMenu` (row actions)
* `Toast` (success/error)

### Shared backend rules

* Zod validation for every write endpoint
* Transactions for every “post” operation
* Idempotency for create/post endpoints
* Audit log for create/update/post/void/settings changes

---

## 0.5) Platform Foundation (Phase 0)

**Screens**

* Login
* Protected dashboard (smoke test)

**UI Components**

* Simple form inputs + primary button

**API**

* `POST /auth/login`
* `POST /auth/refresh`
* `POST /auth/logout`
* `GET /auth/me`
* `GET /health`
* `GET /health/protected`

**DB Tables**

* `users`
* `memberships`
* `roles`, `permissions`, `role_permissions`
* `audit_logs`
* `refresh_tokens` (refresh rotation)

**Tests**

* Login/refresh/logout flow
* RBAC guard on protected endpoint
* Sentry test error endpoint (dev only)

---

## 1) Organization & Setup

### US-ORG-01 Create Organization

**Screens**

* Onboarding Wizard (implemented as `/dashboard` org setup section in Phase 1)

**UI Components**

* Form: `Input`, `Select`, `Switch`, `DatePicker`
* Actions: `Button`

**API**

* `POST /orgs`
* `GET /orgs/current`
* `PATCH /orgs/current`

**DB Tables**

* `organizations`
* `org_settings`
* `accounts` (bootstrapped system accounts)
* `roles`, `permissions`, `role_permissions`, `memberships` (seed)
* `audit_logs`

**Ledger Impact**

* None (setup only)

**Tests**

* Create org creates default accounts + system roles
* VAT enabled requires VAT accounts present
* Permissions created and owner membership assigned

---

## 2) Users, Roles & Permissions

### US-AUTH-01 Invite User + Assign Role

**Screens**

* Settings → Users (implemented as `/dashboard?tab=users` in Phase 1)
* Invite User Dialog

**UI Components**

* Table list + `Dialog` invite
* Role dropdown `Select`

**API**

* `POST /orgs/users/invite`
* `POST /orgs/users/invite/accept`
* `GET /orgs/users`
* `PATCH /orgs/users/:id` (change role/disable)

**DB Tables**

* `users`
* `invites`
* `memberships`
* `roles`, `role_permissions`
* `audit_logs`

**Ledger Impact**

* None

**Tests**

* Invite creates tokenHash + expiry
* Accept invite creates membership
* Role changes enforce permissions on endpoints

---

## 3) Chart of Accounts

### US-COA-01 Manage Accounts

**Screens**

* Accounting → Chart of Accounts (implemented as `/dashboard?tab=accounts` in Phase 1)
* New Account (Sheet)

**UI Components**

* Table with filters
* Create/Edit in `Sheet`
* Deactivate action with `Dialog`

**API**

* `GET /accounts`
* `POST /accounts`
* `PATCH /accounts/:id`

**DB Tables**

* `accounts`
* `audit_logs`

**Ledger Impact**

* None directly, but accounts are destinations for GL lines

**Tests**

* Unique `(orgId, code)`
* System accounts cannot change type/subtype
* Cannot deactivate system accounts required for posting

---

## 4) Tax Codes (VAT)

### US-TAX-01 Configure Tax Codes

**Screens**

* Settings → Taxes (implemented as `/dashboard?tab=taxes` in Phase 2)

**UI Components**

* Table
* Edit in `Sheet`

**API**

* `GET /tax-codes`
* `POST /tax-codes` (optional)
* `PATCH /tax-codes/:id` (optional)

**DB Tables**

* `tax_codes`
* `audit_logs`

**Ledger Impact**

* Used to compute VAT posting lines

**Tests**

* VAT disabled hides/blocks tax usage
* VAT rate rounding rules consistent

---

## 5) Customers & Vendors

### US-CUST-01 Customers CRUD

**Screens**

* Sales → Customers (implemented as `/dashboard?tab=customers` in Phase 2)
* Customer Details

**UI Components**

* Customers list table
* Create/Edit customer in `Sheet`

**API**

* `GET /customers`
* `POST /customers`
* `GET /customers/:id`
* `PATCH /customers/:id`

**DB Tables**

* `customers`
* `audit_logs`

**Ledger Impact**

* None directly; referenced on GL lines for sub-ledger reporting

**Tests**

* Required name
* Soft duplicates warning (optional)

---

### US-VEND-01 Vendors CRUD

**Screens**

* Purchases → Vendors (implemented as `/dashboard?tab=vendors` in Phase 2)
* Vendor Details

**API**

* `GET /vendors`
* `POST /vendors`
* `GET /vendors/:id`
* `PATCH /vendors/:id`

**DB Tables**

* `vendors`
* `audit_logs`

---

## 6) Items (Products/Services)

### US-ITEM-01 Items CRUD

**Screens**

* Items (implemented as `/dashboard?tab=items` in Phase 2)
* Item Detail

**UI Components**

* Table + `Sheet`

**API**

* `GET /items`
* `POST /items`
* `GET /items/:id`
* `PATCH /items/:id`

**DB Tables**

* `items`
* `accounts` (income/expense mapping)
* `tax_codes` (default)
* `audit_logs`

**Ledger Impact**

* Determines which accounts are used when posting invoice/bill lines

**Tests**

* Item must have incomeAccountId, expenseAccountId
* Tax code optional when VAT disabled

---

## 7) Sales – Invoices

### US-SALES-01 Create Invoice (Draft)

**Screens**

* Sales → Invoices (List, `/invoices`)
* Invoice Create/Edit (full page, `/invoices/new` and `/invoices/:id`)
* Invoice View (read-only when posted, `/invoices/:id`)

**UI Components**

* Header: status badge + actions
* Lines: editable table (TanStack)
* Customer select (searchable)
* Totals panel (right side)

**API**

* `GET /invoices`
* `POST /invoices` (Draft)
* `GET /invoices/:id`
* `PATCH /invoices/:id` (Draft only)

**DB Tables**

* `invoices`
* `invoice_lines`
* `customers`, `items`, `tax_codes`
* `audit_logs`

**Ledger Impact**

* None until posted

**Tests**

* Totals computed server-side
* Draft editable; posted immutable

---

### US-SALES-01b Post Invoice

**Screens**

* Invoice View → Post button → Confirmation Dialog with ledger preview (`/invoices/:id`)

**UI Components**

* `Dialog` confirmation
* Ledger preview list

**API**

* `POST /invoices/:id/post` (Idempotency-Key supported)

**DB Tables**

* `invoices` (status → POSTED, postedAt)
* `gl_headers` (sourceType=INVOICE)
* `gl_lines`
* `org_settings` (numbering)
* `audit_logs`
* `idempotency_keys`

**Ledger Posting (Invoice)**

* Dr `Accounts Receivable (AR)` = invoice total
* Cr `Sales Revenue` = subtotal
* Cr `VAT Payable` = taxTotal (if VAT enabled)

**Tests**

* Transaction atomicity: invoice + GL commit together
* Unique posting constraint prevents double-post
* Balanced GL lines check
* Idempotency: same key returns same response

---

## 8) Sales – Payments Received

### US-SALES-02 Create Payment (Draft)

**Screens**

* Sales → Payments Received list
* Receive Payment form

**UI Components**

* Customer select
* Invoice allocation table
* Bank account select

**API**

* `GET /payments-received`
* `POST /payments-received` (Draft)
* `GET /payments-received/:id`
* `PATCH /payments-received/:id` (Draft only)
* `GET /bank-accounts` (selection list)

**DB Tables**

* `payments_received`
* `payment_received_allocations`
* `invoices` (for outstanding)
* `audit_logs`

**Ledger Impact**

* None until posted

---

### US-SALES-02b Post Payment Received

**API**

* `POST /payments-received/:id/post` (Idempotency-Key)

**DB Tables**

* `payments_received` (POSTED)
* `payment_received_allocations`
* `gl_headers` (sourceType=PAYMENT_RECEIVED)
* `gl_lines`
* `audit_logs`
* `idempotency_keys`

**Ledger Posting (Payment Received)**

* Dr `Bank/Cash` = amountTotal
* Cr `Accounts Receivable` = allocated total

**Rules**

* Must lock invoice rows FOR UPDATE
* Allocation cannot exceed outstanding

**Tests**

* Partial payments supported
* Over-allocation blocked
* Double post blocked

---

## 9) Purchases – Bills

### US-PUR-01 Create Bill (Draft)

**Screens**

* Purchases → Bills list
* Bill create/edit

**UI Components**

* Vendor select
* Lines table (expense accounts + items)
* Totals panel

**API**

* `GET /bills`
* `POST /bills` (Draft)
* `GET /bills/:id`
* `PATCH /bills/:id` (Draft only)

**DB Tables**

* `bills`
* `bill_lines`
* `vendors`, `accounts`, `tax_codes`
* `audit_logs`

---

### US-PUR-01b Post Bill

**API**

* `POST /bills/:id/post`

**DB Tables**

* `bills` (POSTED)
* `gl_headers` (sourceType=BILL)
* `gl_lines`
* `audit_logs`
* `idempotency_keys`

**Ledger Posting (Bill)**

* Dr `Expense/COGS` = subtotal (from bill lines)
* Dr `VAT Receivable` = taxTotal (if VAT enabled)
* Cr `Accounts Payable` = total

**Tests**

* Balanced posting
* Unique posting prevents duplicates

---

## 10) Purchases – Vendor Payments

### US-PUR-02 Create Vendor Payment (Draft)

**Screens**

* Purchases → Vendor Payments
* Pay Bills flow

**UI Components**

* Vendor select
* Bills allocation table
* Bank account select

**API**

* `GET /vendor-payments`
* `POST /vendor-payments` (Draft)
* `GET /vendor-payments/:id`
* `PATCH /vendor-payments/:id` (Draft only)

**DB Tables**

* `vendor_payments`
* `vendor_payment_allocations`
* `bills`
* `audit_logs`

---

### US-PUR-02b Post Vendor Payment

**API**

* `POST /vendor-payments/:id/post`

**DB Tables**

* `vendor_payments` (POSTED)
* `vendor_payment_allocations`
* `gl_headers` (sourceType=VENDOR_PAYMENT)
* `gl_lines`
* `audit_logs`
* `idempotency_keys`

**Ledger Posting (Vendor Payment)**

* Dr `Accounts Payable` = allocated total
* Cr `Bank/Cash` = amountTotal

**Rules**

* Lock bill rows FOR UPDATE
* Allocation cannot exceed outstanding

**Tests**

* Partial payment allowed
* Overpay blocked or handled as vendor credit (phase 2)

---

## 11) Journals

### US-GL-01 Journal Entry Draft & Post

**Screens**

* Accounting → Journals list
* Journal create/edit

**UI Components**

* Lines table (account, debit, credit)
* Balance indicator (must be 0 difference)

**API**

* `GET /journals`
* `POST /journals` (Draft)
* `PATCH /journals/:id` (Draft only)
* `POST /journals/:id/post`

**DB Tables**

* `journal_entries`
* `journal_lines`
* `gl_headers` (sourceType=JOURNAL)
* `gl_lines`
* `audit_logs`
* `idempotency_keys`

**Ledger Posting**

* GL lines match journal lines exactly

**Tests**

* Debit = credit required
* Post creates GL header+lines

---

## 12) Banking & Reconciliation

### US-BANK-01 Bank Accounts

**Screens**

* Banking → Bank Accounts

**UI Components**

* Table
* Create/Edit in Sheet

**API**

* `GET /bank-accounts`
* `POST /bank-accounts`
* `PATCH /bank-accounts/:id`

**DB Tables**

* `bank_accounts`
* `accounts` (linked GL account subtype=BANK)
* `audit_logs`

---

### US-BANK-02 Import Bank Statement

**Screens**

* Banking → Import

**UI Components**

* File upload
* Mapping screen (phase 2)

**API**

* `POST /bank-transactions/import`

**DB Tables**

* `bank_transactions`
* `audit_logs`

**Tests**

* Dedup rules enforced

---

### US-BANK-03 Reconcile

**Screens**

* Banking → Reconcile

**UI Components**

* Split view: bank lines vs internal transactions
* Match actions

**API**

* `POST /reconciliation-sessions`
* `GET /reconciliation-sessions/:id`
* `POST /reconciliation-sessions/:id/match`
* `POST /reconciliation-sessions/:id/close`

**DB Tables**

* `reconciliation_sessions`
* `reconciliation_matches`
* `bank_transactions`
* `gl_headers`

---

## 13) Reports

### US-REP-01 Trial Balance

**Screen**

* Reports → Trial Balance

**API**

* `GET /reports/trial-balance?from&to`

**DB**

* Reads `gl_lines` joined with `gl_headers`, grouped by account

**Tests**

* Sum debit = sum credit

---

### US-REP-02 Profit & Loss

**API**

* `GET /reports/profit-loss?from&to`

**DB**

* Uses account type INCOME/EXPENSE sums

---

### US-REP-03 Balance Sheet

**API**

* `GET /reports/balance-sheet?asOf`

**DB**

* Assets vs Liabilities+Equity

---

### US-REP-04 AR/AP Aging

**API**

* `GET /reports/ar-aging?asOf`
* `GET /reports/ap-aging?asOf`

**DB**

* Uses documents + allocations to compute outstanding buckets

---

### US-REP-05 VAT Summary

**API**

* `GET /reports/vat-summary?from&to`

**DB**

* Output VAT from sales postings
* Input VAT from purchases postings

---

## 14) Audit & Compliance

### US-AUD-01 Audit Trail

**Screens**

* Settings → Audit Log

**API**

* `GET /audit-logs?from&to&entityType&actor`

**DB**

* `audit_logs`

**Tests**

* Critical actions create audit log entry

---

## 15) Observability Mapping (Operational Requirements)

### Logging

* API emits JSON logs with `requestId`, `orgId`, `userId`
* Web logs server-side errors, client errors go to Sentry

### Tracing

* OpenTelemetry traces wrap:

  * Posting operations
  * Allocation operations
  * Reporting queries

### Metrics

* Prometheus metrics:

  * request latency
  * errors
  * posting failures

---

## 16) Definition of Done (per story)

A story is DONE only if it includes:

1. DB schema/migration (Prisma)
2. API endpoint(s) implemented + Zod validation
3. UI screen implemented using design system patterns
4. Permission enforcement
5. Audit logs for state changes
6. Posting logic (if applicable) with balanced GL entries
7. Unit + integration tests
8. Docs update (this mapping updated)

---


With this mapping complete, the project can be executed as **vertical slices**:

1. Org + CoA
2. Customers/Items
3. Invoices (draft/post)
4. Payments (allocate/post)
5. Bills + Vendor payments
6. Reports + Audit
