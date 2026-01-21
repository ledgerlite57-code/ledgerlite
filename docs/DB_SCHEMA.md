# LedgerLite – Database Schema (ERD + Tables + Constraints)

This document defines the **full accounting-grade database schema** for LedgerLite.

It is designed for:

* NestJS + Prisma + Postgres
* Double-entry, immutable ledger
* Strong auditability
* Safe concurrency (locking, idempotency)
* Reporting performance

> **Scope**: Covers MVP + near-term phase-2 use cases. Inventory and multi-currency are included as optional extensions.

---

## 1. Entity Relationship Overview (Text ERD)

```
Organization
  ├── Users (many-to-many via memberships)
  ├── Roles & Permissions
  ├── Chart of Accounts (accounts)
  ├── Tax Codes
  ├── Customers
  ├── Vendors
  ├── Items
  ├── Documents
  │     ├── Invoices + InvoiceLines
  │     ├── Bills + BillLines
  │     ├── PaymentsReceived + Allocations
  │     ├── VendorPayments + Allocations
  │     ├── JournalEntries + JournalLines
  │     └── CreditNotes (phase 2)
  ├── Banking
  │     ├── BankAccounts
  │     ├── BankTransactions (imported/manual)
  │     └── ReconciliationSessions + Matches
  ├── Ledger
  │     ├── GLHeaders (posted events)
  │     └── GLLines (immutable)
  ├── Attachments
  ├── AuditLog
  └── IdempotencyKeys
```

---

## 2. Global Conventions

### 2.1 IDs and timestamps

* All primary keys: `UUID`
* Timestamps: `timestamptz` (`createdAt`, `updatedAt`)

### 2.2 Money

* All money fields use `decimal(18,2)`
* Store both:

  * `subTotal`, `taxTotal`, `total`
  * line-level `lineSubTotal`, `lineTax`, `lineTotal`

### 2.3 Status enums

* Most documents:

  * `DRAFT` → `POSTED` → `VOID`

### 2.4 Soft delete

* Master data (customers/vendors/items/accounts) is **deactivated**, not deleted.
* Posted financial records are never deleted.

---

## 3. Core Organization & Security Tables

### 3.1 organizations

**Purpose:** Tenant boundary.

Columns

* `id`
* `name`
* `countryCode` (e.g. AE)
* `baseCurrency` (default AED)
* `fiscalYearStartMonth` (1-12)
* `vatEnabled` (bool)
* `vatTrn` (nullable)
* `timeZone` (e.g. Asia/Dubai)
* `createdAt`, `updatedAt`

Constraints

* `name` required

Indexes

* `(name)`

---

### 3.2 users

**Purpose:** Auth identities.

Columns

* `id`
* `email` (unique global)
* `passwordHash` (nullable if magic-link later)
* `isInternal` (bool, default false)
* `internalRole` (nullable enum, e.g. MANAGER)
* `isActive`
* `lastLoginAt` (nullable)
* `createdAt`, `updatedAt`

Constraints

* `UNIQUE(email)`

---

### 3.3 roles

**Purpose:** Roles scoped per org.

Columns

* `id`
* `orgId`
* `name` (Owner/Accountant/etc)
* `isSystem` (bool)
* `createdAt`, `updatedAt`

Constraints

* `UNIQUE(orgId, name)`

---

### 3.4 permissions

**Purpose:** System permission catalog.

Columns

* `code` (PK) e.g. `INVOICE_CREATE`, `INVOICE_POST`, `REPORT_VIEW`
* `description`

---

### 3.5 role_permissions

**Purpose:** Role→permission mapping.

Columns

* `roleId`
* `permissionCode`

Constraints

* `PK(roleId, permissionCode)`

---

### 3.6 memberships

**Purpose:** User membership in an org.

Columns

* `id`
* `orgId`
* `userId`
* `roleId`
* `isActive`
* `createdAt`, `updatedAt`

Constraints

* `UNIQUE(orgId, userId)`

Indexes

* `(orgId, userId)`

---

### 3.7 invites

**Purpose:** Invitation flow.

Columns

* `id`
* `orgId`
* `email`
* `roleId`
* `tokenHash`
* `expiresAt`
* `acceptedAt` (nullable)
* `createdAt`

Constraints

* `UNIQUE(orgId, email, acceptedAt)` (or enforce only one pending invite)

### 3.8 magic_link_tokens

**Purpose:** Magic-link authentication.

Columns

* `id`
* `userId`
* `tokenHash`
* `expiresAt`
* `usedAt` (nullable)
* `createdAt`

Constraints

* `UNIQUE(tokenHash)`

---

## 4. Accounting Foundation Tables

### 4.1 accounts (Chart of Accounts)

**Purpose:** Posting destination for all GL lines.

Columns

* `id`
* `orgId`
* `code` (string; unique per org)
* `name`
* `type` enum: `ASSET | LIABILITY | EQUITY | INCOME | EXPENSE`
* `subtype` enum (examples):

  * `BANK, CASH, AR, AP, VAT_RECEIVABLE, VAT_PAYABLE, SALES, EXPENSE, EQUITY`
* `isSystem` (bool)
* `isActive` (bool)
* `createdAt`, `updatedAt`

Constraints

* `UNIQUE(orgId, code)`

Indexes

* `(orgId, type)`
* `(orgId, isActive)`

---

### 4.2 tax_codes

**Purpose:** VAT/tax configuration.

Columns

* `id`
* `orgId`
* `name` (VAT 5%, Zero-rated, Exempt)
* `rate` decimal(5,2)
* `type` enum: `STANDARD | ZERO | EXEMPT | OUT_OF_SCOPE`
* `isActive`
* `createdAt`, `updatedAt`

Constraints

* `UNIQUE(orgId, name)`

---

### 4.3 org_settings (optional)

**Purpose:** Document numbering and module configs.

Columns

* `orgId` (PK)
* `invoicePrefix`, `invoiceNextNumber`
* `billPrefix`, `billNextNumber`
* `paymentPrefix`, `paymentNextNumber`
* `lockDate` (nullable) — period lock (phase 2)
* `createdAt`, `updatedAt`

---

## 5. Master Data Tables

### 5.1 customers

Columns

* `id`
* `orgId`
* `name`
* `email` (nullable)
* `phone` (nullable)
* `billingAddress` (jsonb)
* `shippingAddress` (jsonb nullable)
* `trn` (nullable)
* `paymentTermsDays` (default 0)
* `creditLimit` (nullable)
* `isActive`
* `createdAt`, `updatedAt`

Constraints

* Optional: `UNIQUE(orgId, name)` (soft duplicates recommended)

Indexes

* `(orgId, name)`

---

### 5.2 vendors

Columns

* `id`
* `orgId`
* `name`
* `email` (nullable)
* `phone` (nullable)
* `address` (jsonb)
* `trn` (nullable)
* `paymentTermsDays` (default 0)
* `isActive`
* `createdAt`, `updatedAt`

Indexes

* `(orgId, name)`

---

### 5.3 items

**MVP:** no inventory valuation.

Columns

* `id`
* `orgId`
* `name`
* `type` enum: `SERVICE | PRODUCT`
* `sku` (nullable)
* `salePrice` decimal(18,2)
* `purchasePrice` decimal(18,2) nullable
* `incomeAccountId` (FK accounts)
* `expenseAccountId` (FK accounts)
* `defaultTaxCodeId` (FK tax_codes nullable)
* `isActive`
* `createdAt`, `updatedAt`

Constraints

* Optional: `UNIQUE(orgId, sku)` when sku present

Indexes

* `(orgId, name)`

---

## 6. Documents – Sales

### 6.1 invoices

Columns

* `id`
* `orgId`
* `number` (nullable until posted or assigned at draft)
* `status` enum: `DRAFT | POSTED | VOID`
* `paymentStatus` enum: `UNPAID | PARTIAL | PAID`
* `amountPaid` decimal(18,2)
* `customerId`
* `invoiceDate`
* `dueDate`
* `currency` (default base; phase 2 multi-currency)
* `exchangeRate` decimal(18,6) nullable
* `subTotal`, `taxTotal`, `total`
* `notes` (nullable)
* `terms` (nullable)
* `postedAt` (nullable)
* `voidedAt` (nullable)
* `createdByUserId`
* `createdAt`, `updatedAt`

Constraints

* `UNIQUE(orgId, number)` (when not null)

Indexes

* `(orgId, status, invoiceDate)`
* `(orgId, customerId, invoiceDate)`

---

### 6.2 invoice_lines

Columns

* `id`
* `invoiceId`
* `lineNo` (int)
* `itemId` (nullable)
* `description`
* `qty` decimal(18,4)
* `unitPrice` decimal(18,2)
* `discountAmount` decimal(18,2) default 0
* `taxCodeId` nullable
* `lineSubTotal`, `lineTax`, `lineTotal`

Constraints

* `UNIQUE(invoiceId, lineNo)`

Indexes

* `(invoiceId)`

---

### 6.3 payments_received

Columns

* `id`
* `orgId`
* `number` (nullable)
* `status` enum: `DRAFT | POSTED | VOID`
* `customerId`
* `bankAccountId` (FK bank_accounts) nullable for cash
* `paymentDate`
* `currency`
* `exchangeRate` nullable
* `amountTotal`
* `reference` (nullable)
* `memo` (nullable)
* `postedAt` nullable
* `createdByUserId`
* `createdAt`, `updatedAt`

Constraints

* `UNIQUE(orgId, number)` when not null

Indexes

* `(orgId, customerId, paymentDate)`

---

### 6.4 payment_received_allocations

**Purpose:** Map a payment to invoices.

Columns

* `id`
* `paymentReceivedId`
* `invoiceId`
* `amount` decimal(18,2)

Constraints

* `UNIQUE(paymentReceivedId, invoiceId)`

Indexes

* `(invoiceId)`

---

## 7. Documents – Purchases

### 7.1 bills

Columns

* `id`
* `orgId`
* `vendorId`
* `billNumber` (vendor invoice number; nullable)
* `systemNumber` (optional internal)
* `status` enum: `DRAFT | POSTED | VOID`
* `billDate`
* `dueDate`
* `currency`
* `exchangeRate` nullable
* `subTotal`, `taxTotal`, `total`
* `notes` nullable
* `postedAt` nullable
* `createdByUserId`
* `createdAt`, `updatedAt`

Constraints

* Optional strict: `UNIQUE(orgId, vendorId, billNumber)` when billNumber not null

Indexes

* `(orgId, status, billDate)`
* `(orgId, vendorId, billDate)`

---

### 7.2 bill_lines

Columns

* `id`
* `billId`
* `lineNo`
* `expenseAccountId` (FK accounts)
* `itemId` nullable
* `description`
* `qty` decimal(18,4)
* `unitPrice` decimal(18,2)
* `discountAmount` decimal(18,2) default 0
* `taxCodeId` nullable
* `lineSubTotal`, `lineTax`, `lineTotal`

Constraints

* `UNIQUE(billId, lineNo)`

---

### 7.3 vendor_payments

Columns

* `id`
* `orgId`
* `number` nullable
* `status` enum: `DRAFT | POSTED | VOID`
* `vendorId`
* `bankAccountId` nullable
* `paymentDate`
* `currency`
* `exchangeRate` nullable
* `amountTotal`
* `reference` nullable
* `memo` nullable
* `postedAt` nullable
* `createdByUserId`
* `createdAt`, `updatedAt`

Constraints

* `UNIQUE(orgId, number)` when not null

---

### 7.4 vendor_payment_allocations

Columns

* `id`
* `vendorPaymentId`
* `billId`
* `amount`

Constraints

* `UNIQUE(vendorPaymentId, billId)`

---

## 8. General Ledger & Posting Tables

### 8.1 gl_headers

**Purpose:** One posting event per posted document.

Columns

* `id`
* `orgId`
* `sourceType` enum: `INVOICE | BILL | PAYMENT_RECEIVED | VENDOR_PAYMENT | JOURNAL | CREDIT_NOTE | ...`
* `sourceId` (UUID)
* `postingDate` (timestamptz)
* `currency`
* `exchangeRate` nullable
* `totalDebit`, `totalCredit`
* `status` enum: `POSTED | REVERSED | VOID`
* `reversedByHeaderId` nullable (self FK)
* `memo` nullable
* `createdByUserId`
* `createdAt`

Constraints

* `UNIQUE(orgId, sourceType, sourceId)`  **(prevents double-posting)**

Indexes

* `(orgId, postingDate)`
* `(orgId, sourceType)`

---

### 8.2 gl_lines

**Purpose:** Immutable ledger lines.

Columns

* `id`
* `headerId`
* `lineNo`
* `accountId`
* `debit` decimal(18,2) default 0
* `credit` decimal(18,2) default 0
* `description` nullable
* `customerId` nullable
* `vendorId` nullable
* `taxCodeId` nullable

Constraints

* `UNIQUE(headerId, lineNo)`
* CHECK: NOT (debit > 0 AND credit > 0)

Indexes

* `(accountId)`
* `(headerId)`
* `(customerId)`
* `(vendorId)`

---

## 9. Journals

### 9.1 journal_entries

Columns

* `id`
* `orgId`
* `number` nullable
* `status` enum: `DRAFT | POSTED | VOID`
* `journalDate`
* `memo` nullable
* `postedAt` nullable
* `createdByUserId`
* `createdAt`, `updatedAt`

Constraints

* `UNIQUE(orgId, number)` when not null

---

### 9.2 journal_lines

Columns

* `id`
* `journalEntryId`
* `lineNo`
* `accountId`
* `debit`
* `credit`
* `description` nullable
* `customerId` nullable
* `vendorId` nullable

Constraints

* `UNIQUE(journalEntryId, lineNo)`
* CHECK: one of debit/credit positive

---

## 10. Banking & Reconciliation

### 10.1 bank_accounts

Columns

* `id`
* `orgId`
* `name`
* `accountNumberMasked` nullable
* `currency`
* `glAccountId` (FK accounts subtype=BANK)
* `openingBalance` decimal(18,2) default 0
* `openingBalanceDate` nullable
* `isActive`
* `createdAt`, `updatedAt`

Constraints

* `UNIQUE(orgId, name)`

---

### 10.2 bank_transactions

**Purpose:** Imported or manually entered bank statement lines.

Columns

* `id`
* `orgId`
* `bankAccountId`
* `txnDate`
* `description`
* `amount` decimal(18,2) (positive inflow, negative outflow)
* `currency`
* `externalRef` nullable (bank ref)
* `source` enum: `IMPORT | MANUAL`
* `matched` bool default false
* `createdAt`

Constraints

* Dedup strategy:

  * `UNIQUE(orgId, bankAccountId, txnDate, amount, externalRef)` (when externalRef not null)

Indexes

* `(orgId, bankAccountId, txnDate)`

---

### 10.3 reconciliation_sessions

Columns

* `id`
* `orgId`
* `bankAccountId`
* `periodStart`, `periodEnd`
* `statementOpeningBalance`, `statementClosingBalance`
* `status` enum: `OPEN | CLOSED`
* `createdByUserId`
* `createdAt`, `updatedAt`

Constraints

* `UNIQUE(orgId, bankAccountId, periodStart, periodEnd)`

---

### 10.4 reconciliation_matches

**Purpose:** Link bank transaction to internal posting.

Columns

* `id`
* `reconciliationSessionId`
* `bankTransactionId`
* `glHeaderId` nullable (or `sourceType+sourceId`)
* `matchType` enum: `AUTO | MANUAL | SPLIT`
* `createdAt`

Constraints

* `UNIQUE(reconciliationSessionId, bankTransactionId)`

---

## 11. Attachments

### 11.1 attachments

Columns

* `id`
* `orgId`
* `entityType` enum: `INVOICE | BILL | PAYMENT | CUSTOMER | VENDOR | JOURNAL`
* `entityId` UUID
* `fileName`
* `mimeType`
* `sizeBytes`
* `storageKey` (path or object key)
* `uploadedByUserId`
* `createdAt`

Indexes

* `(orgId, entityType, entityId)`

---

## 12. Audit & Idempotency

### 12.1 audit_logs

Columns

* `id`
* `orgId`
* `actorUserId`
* `entityType`
* `entityId`
* `action` enum: `CREATE | UPDATE | POST | VOID | DELETE | LOGIN | SETTINGS_CHANGE`
* `before` jsonb nullable
* `after` jsonb nullable
* `requestId` nullable
* `ip` nullable
* `userAgent` nullable
* `createdAt`

Indexes

* `(orgId, createdAt)`
* `(orgId, entityType, entityId)`

---

### 12.2 idempotency_keys

Columns

* `id`
* `orgId`
* `key` (string)
* `requestHash` (string)
* `response` jsonb
* `statusCode` int
* `createdAt`

Constraints

* `UNIQUE(orgId, key)`

Usage

* On POST/POST-POST endpoints (create/post)
* If key exists:

  * Same requestHash → return stored response
  * Different requestHash → 409 conflict

---

## 13. Phase-2 Extensions (Optional)

### 13.1 Credit Notes

Tables:

* `credit_notes`
* `credit_note_lines`
* `credit_note_applications` (apply to invoice)

Ledger impact:

* Reverse sales/VAT/AR or create customer credit.

### 13.2 Multi-currency

Add:

* `currencies` (supported list)
* `exchange_rates` (daily rates)
* Ensure documents store `currency` + `exchangeRate`
* Add FX gain/loss accounts

### 13.3 Inventory

Tables:

* `warehouses`
* `stock_movements`
* `inventory_valuations`

---

## 14. Mandatory Database Guardrails (Do Not Skip)

1. **Unique posting constraint**

   * `gl_headers(orgId, sourceType, sourceId)` unique

2. **No editing posted documents**

   * Application rule enforced in service layer + tested

3. **Balanced ledger entries**

   * Enforced in service logic + tested

4. **Row locks on allocations**

   * Payment posting uses FOR UPDATE on invoice/bill rows

5. **Audit logs for all critical actions**

   * POST/VOID/SETTINGS/ROLE changes

6. **Idempotency**

   * Required for posting endpoints

---

## 15. Prisma Modeling Notes

Prisma recommendations:

* Use `@id @default(uuid())`
* Use `@db.Timestamptz(6)` for timestamps
* Use `Decimal` type for money
* Use explicit relations and referential actions:

  * Restrict deletes for posted/ledger-related entities

---
