# LedgerLite – User Stories (v1.1)

> Version: v1.1  
> Status: FROZEN  
> Audience: Product, Engineering, Codex  
> Notes: This file is consistent with `mapping.md` and DB schema (Prisma/Postgres).

## Global Acceptance Rules (apply to all stories)

- Writes use Zod validation
- Permissions enforced server-side on every endpoint (403)
- All critical actions write audit logs
- Financial documents:
  - Draft editable
  - Posted immutable
  - Corrections use Void/Reversal or Credit Notes (phase 2)
- Posting/Voiding:
  - runs inside DB transaction
  - idempotency enforced (Idempotency-Key)
  - creates/updates ledger records where applicable

---

## 1. Organization & Setup

### US-ORG-01 – Create Organization
As an Owner, I want to create an organization so accounting data is isolated and configured correctly.

Acceptance Criteria
- Base currency, fiscal year, VAT settings captured
- Default system accounts created (AR/AP/VAT/BANK/CUSTOMER_ADVANCES/VENDOR_PREPAYMENTS etc.)
- System roles and permissions seeded
- Owner membership created
- Numbering settings seeded in org_settings
- Audit log written
- Idempotency supported on create

---

## 2. Users, Roles & Permissions

### US-AUTH-01 – Invite User
As an Owner, I want to invite users and assign roles so duties are separated.

Acceptance Criteria
- Invite token generated with expiry and stored as tokenHash
- Accept invite creates/activates membership
- Role-based permissions enforced on UI + API
- Audit log written for invite + acceptance + role changes + disable

---

## 3. Chart of Accounts

### US-COA-01 – Manage Accounts
As an Accountant, I want to manage the chart of accounts so transactions post correctly.

Acceptance Criteria
- Unique account codes per org
- System accounts protected (type/subtype locked, cannot deactivate)
- Accounts with GL postings cannot change type/subtype
- Accounts in use cannot be deleted (only deactivate where allowed)
- Audit log written

---

## 4. Tax Codes (VAT)

### US-TAX-01 – Manage Tax Codes
As an Owner/Accountant, I want to configure VAT tax codes so tax is computed correctly.

Acceptance Criteria
- VAT enabled allows tax codes and tax usage in drafts
- VAT disabled prevents tax usage in new drafts (but does not break history/reporting)
- Audit log written on create/update

---

## 5. Customers & Vendors

### US-CUST-01 – Manage Customers
As a Sales user, I want to manage customers so I can invoice them.

Acceptance Criteria
- Required name
- VAT/TRN supported
- Soft deactivation via isActive
- Audit log written

### US-VEND-01 – Manage Vendors
As a Purchases user, I want to manage vendors so I can track bills.

Acceptance Criteria
- Required name
- VAT/TRN supported
- Soft deactivation via isActive
- Audit log written

---

## 6. Items

### US-ITEM-01 – Manage Items
As a User, I want to create products/services so accounts and taxes auto-fill.

Acceptance Criteria
- Income and expense accounts required and belong to same org
- Default tax code optional (must be null when VAT disabled)
- Inactive item cannot be used in new drafts
- Audit log written

---

## 7. Sales – Invoices

### US-SALES-01 – Create Invoice (Draft)
As a Sales user, I want to create invoices so I can bill customers.

Acceptance Criteria
- Draft invoices editable
- Totals calculated server-side and stored (subTotal/taxTotal/total)
- No ledger impact while draft
- Audit log written for create/update
- Idempotent create supported

### US-SALES-01b – Post Invoice
As a Sales user, I want to post an invoice so it affects accounting.

Acceptance Criteria
- Confirmation dialog includes ledger preview
- Atomic transaction: invoice status + number assignment + GL posting
- Double-entry ledger posting:
  - Dr AR, Cr Sales, Cr VAT Payable (if applicable)
- Invoice immutable after posting
- Idempotency enforced (same key returns same response)
- Audit log written for POST

### US-SALES-01c – Void Invoice
As a Sales user, I want to void a posted invoice to correct mistakes without editing history.

Acceptance Criteria
- Void uses reversal ledger posting linked to original
- Invoice status becomes VOID with voidedAt
- MVP: void blocked if invoice has payment allocations (unless auto-reversal of allocations is implemented)
- Idempotency enforced
- Audit log written for VOID

---

## 8. Sales – Payments Received

### US-SALES-02 – Receive Payment (Draft)
As a Finance user, I want to record customer payments to reduce AR.

Acceptance Criteria
- Payment can allocate to one or many invoices
- Draft editable; no ledger impact
- Idempotent create supported
- Audit log written for create/update

### US-SALES-02b – Post Payment Received
As a Finance user, I want to post the payment so AR reduces and cash increases.

Acceptance Criteria
- Atomic transaction with row locks on affected invoices
- Allocation cannot exceed outstanding
- Posting supports partial allocations
- Ledger posting:
  - Dr Bank/Cash = amountTotal
  - Cr AR = allocatedTotal
  - Cr Customer Advances = unallocated (if any)
- Idempotency enforced
- Audit log written for POST

### US-SALES-02c – Void Payment Received
As a Finance user, I want to void a posted payment to correct mistakes.

Acceptance Criteria
- Void posts reversal GL and restores outstanding balances
- Idempotency enforced
- Audit log written for VOID

---

## 9. Purchases – Bills

### US-PUR-01 – Record Bill (Draft)
As a Purchases user, I want to record vendor bills so expenses are tracked.

Acceptance Criteria
- Draft editable; totals server-side; no ledger impact
- VAT handled consistently with settings
- Audit log written for create/update
- Idempotent create supported

### US-PUR-01b – Post Bill
As a Finance user, I want to post bills so AP is recorded.

Acceptance Criteria
- Atomic transaction: status + GL posting
- Ledger posting:
  - Dr expense accounts (lines)
  - Dr VAT receivable (if applicable)
  - Cr AP total
- Idempotency enforced
- Audit log written

### US-PUR-01c – Void Bill
As a Finance user, I want to void a posted bill without editing history.

Acceptance Criteria
- Void posts reversal GL and updates status to VOID
- MVP: void blocked if bill has vendor payment allocations (unless auto-reversal allocations implemented)
- Idempotency enforced
- Audit log written

---

## 10. Purchases – Vendor Payments

### US-PUR-02 – Pay Vendor (Draft)
As a Finance user, I want to pay vendor bills so liabilities are cleared.

Acceptance Criteria
- Allocate to one or many bills
- Draft editable; no ledger impact
- Idempotent create supported
- Audit log written

### US-PUR-02b – Post Vendor Payment
As a Finance user, I want to post vendor payments so AP reduces and cash reduces.

Acceptance Criteria
- Row locking prevents overpayment races
- Ledger posting:
  - Dr AP = allocatedTotal
  - Dr Vendor Prepayments = unallocated (if any)
  - Cr Bank/Cash = amountTotal
- Idempotency enforced
- Audit log written

### US-PUR-02c – Void Vendor Payment
As a Finance user, I want to void a posted vendor payment.

Acceptance Criteria
- Void posts reversal GL and restores outstanding balances
- Idempotency enforced
- Audit log written

---

## 11. Journals

### US-GL-01 – Journal Entry (Draft/Post/Void)
As an Accountant, I want to post manual journals for adjustments.

Acceptance Criteria
- Draft journals editable
- Debit equals credit required before posting
- Posting creates GL header+lines mirroring journal lines
- Posted journals immutable
- Void uses reversal posting
- Idempotency enforced on post/void
- Audit log written

---

## 12. Banking & Reconciliation

### US-BANK-01 – Manage Bank Accounts
As a Finance user, I want to manage bank accounts so cash is tracked.

Acceptance Criteria
- Bank account links to a BANK subtype GL account
- Soft deactivate supported
- Audit log written

### US-BANK-02 – Import Bank Statement (MVP)
As a Finance user, I want to import bank transactions so reconciliation can be done.

Acceptance Criteria
- Import creates bank_transactions
- Dedup rules prevent duplicates when externalRef present
- Audit log written

### US-BANK-03 – Reconcile Bank (Phase 2)
As a Finance user, I want to reconcile statements so books match reality.

Acceptance Criteria
- Reconciliation matches link bank transactions to internal GL headers
- Matching does not create GL postings
- Session close records statement balances and status
- Audit log written

---

## 13. Reports

### US-REP-01 – Financial Reports
As an Owner, I want reports (TB, PL, BS, VAT, AR/AP Aging) to assess performance.

Acceptance Criteria
- Ledger is single source of truth for TB/PL/BS/VAT
- Drill-down supported via gl_headers.sourceType/sourceId
- AR/AP Aging uses documents + allocations with deterministic basis:
  - Aging date = dueDate (fallback invoiceDate/billDate)
  - Outstanding = total - allocations
- Export available (phase 2 if needed)
- Permission enforced (REPORT_VIEW)

---

## 14. Audit & Compliance

### US-AUD-01 – Audit Trail
As an Auditor, I want a full audit trail so all actions are traceable.

Acceptance Criteria
- Before/after values stored for updates where applicable
- Post/Void always logged
- Role/permission changes always logged
- Logs are immutable
- Permission enforced (AUDIT_VIEW)

---

## 15. Definition of Done (per story)

DONE only if it includes:
1) Prisma migration/schema
2) API endpoint(s) + Zod validation
3) UI screen implemented using shared patterns
4) Permission enforcement
5) Audit logs for state changes
6) Posting logic (if applicable) with balanced GL entries
7) Unit + integration tests
8) mapping.md and this file updated
