# 03 - Database Schema

## Overview

- ORM: Prisma
- Provider: PostgreSQL
- Schema file: `apps/api/prisma/schema.prisma`
- Migration history: `apps/api/prisma/migrations/*`

The schema models a multi-tenant accounting system centered on documents, GL posting, allocations, reconciliation, and auditability.

## Key enums

Notable enums defined in schema:

- `AccountType`, `AccountSubtype`, `NormalBalance`
- `TaxType`, `VatBehavior`, `ReportBasis`
- `DocumentStatus` (`DRAFT`, `POSTED`, `VOID`)
- `PaymentStatus` (`UNPAID`, `PARTIAL`, `PAID`)
- `PdcDirection`, `PdcStatus`
- `GLStatus`, `GLSourceType`
- `ItemType`, `InventorySourceType`
- `BankTransactionSource`, `ReconciliationStatus`, `ReconciliationMatchType`
- `AuditAction`, `InternalRole`

## Model groups and relationships

## Identity and tenancy

- `Organization` is the tenant root.
- `User` is global identity.
- `Membership` joins user to organization + role.
- `Role`, `Permission`, `RolePermission` implement RBAC.
- `Invite` supports role-based org invites.
- `RefreshToken` stores hashed refresh tokens per user.

## Organization configuration

- `OrgSettings` stores numbering sequences/prefixes, default accounts, VAT/report settings, optional lock date, and `numberingFormats` JSON.

## Master/accounting setup

- `Account` (chart of accounts) with hierarchy via `parentAccountId`.
- `TaxCode`, `Customer`, `Vendor`, `Item`, `UnitOfMeasure`.
- `Item` supports service/inventory/fixed-asset/non-inventory-expense patterns.

## Transaction documents

- Sales side: `Invoice` + `InvoiceLine`, `CreditNote` + `CreditNoteLine`, `PaymentReceived` + allocations.
- Purchase side: `Bill` + `BillLine`, `Expense` + `ExpenseLine`, `VendorPayment` + allocations.
- Banking: `BankAccount`, `BankTransaction`.
- PDC: `Pdc` + `PdcAllocation` (incoming/outgoing cheque workflows).
- Journals: `JournalEntry` + `JournalLine`.

## Ledger and reconciliation

- `GLHeader` + `GLLine` capture double-entry postings and reversals.
- `ReconciliationSession` + `ReconciliationMatch` map bank transactions to GL entries.

## Cross-cutting

- `InventoryMovement` tracks inventory quantity/value movement by source document.
- `Attachment` stores file metadata linked to entities.
- `SavedView` stores per-user saved filters.
- `AuditLog` stores before/after + request metadata.
- `IdempotencyKey` stores request hash + response by org/key.

## Core constraints and indexes observed

### Tenant-scoped uniqueness

Examples:

- `Role @@unique([orgId, name])`
- `Account @@unique([orgId, code])`
- `TaxCode @@unique([orgId, name])`
- `UnitOfMeasure @@unique([orgId, name])`
- `Invoice @@unique([orgId, number])`
- `Bill @@unique([orgId, systemNumber])`
- `Expense @@unique([orgId, number])`
- `PaymentReceived @@unique([orgId, number])`
- `VendorPayment @@unique([orgId, number])`
- `Pdc @@unique([orgId, number])` and `@@unique([orgId, direction, bankAccountId, chequeNumber])`
- `SavedView @@unique([orgId, userId, entityType, name])`
- `IdempotencyKey @@unique([orgId, key])`

### Posting/allocation integrity

- One GL header per source: `GLHeader @@unique([orgId, sourceType, sourceId])`
- Line uniqueness by document header (`@@unique([<headerId>, lineNo])` patterns)
- Allocation uniqueness constraints on payment/document pairs (for example payment-to-invoice, vendor-payment-to-bill)

### Useful indexes

- Time/status indexes on document tables
- `AuditLog` by org/time and org/entity
- `BankTransaction` by org/account/date
- `InventoryMovement` by org/item and org/source

## Tenant isolation strategy

Schema-level strategy:

- Most business tables include `orgId`.
- Uniqueness/indexing is commonly scoped by `orgId`.

Application-level strategy (enforced in services/guards):

- JWT payload carries org context.
- RBAC checks active membership.
- Queries are scoped with `orgId` in service/repo logic.

## Domain/accounting patterns in data model

- Draft/post/void lifecycle on documents (`DocumentStatus`).
- Payment progress tracked separately (`PaymentStatus` + `amountPaid`).
- PDC has explicit lifecycle states for scheduled/deposited/cleared/bounced/cancelled.
- GL is source-driven (`GLSourceType`) and reversible (`reversedByHeaderId`).
- Reconciliation is period-based and ties bank transactions to GL headers.
- Numbering strategy is persisted in org settings and used by posting services.
- Lock-date support exists in org settings and is checked by services before mutating posted-period data.

## Notes

- No database-level row-level security policies are defined in Prisma schema; tenancy is enforced by application logic.
- Some flexible fields use JSON (`address`, `numberingFormats`, `queryJson`, audit snapshots).
