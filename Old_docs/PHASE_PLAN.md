# LedgerLite – Phase Development Plan (v1.0)

This document defines **how to build LedgerLite as vertical slices (phases)** so development and verification are deterministic.
It is designed to be used with Codex so that **each phase can be implemented end-to-end** (DB → API → UI → Ledger → Tests).

> **Version:** v1.0  
> **Status:** FROZEN  
> **Audience:** Engineering, QA, Codex

---

## Global Definition of Done (applies to every phase)

A phase is DONE only when all items below are complete:

1. **DB**: Prisma models + migrations (and seed updates if needed)
2. **API**: NestJS endpoints + Zod validation + RBAC guards
3. **UI**: Next.js screens following DESIGN_SYSTEM.md
4. **Ledger correctness**: posting engine rules enforced (where applicable)
5. **Audit**: audit logs written for create/update/post/void/settings changes
6. **Idempotency**: for create + post endpoints (where applicable)
7. **Tests**: unit + integration + e2e for the phase flows
8. **Docs**: MAPPING.md updated if any endpoint/table changes
9. **Observability**: logs include requestId/orgId/userId; errors go to Sentry

---

## Phase 0 — Platform Foundation (must be done first)

### Scope
- Monorepo + tooling
- Auth scaffolding
- RBAC plumbing
- Observability scaffolding
- Docker compose local stack

### Deliverables
- Repo structure (apps/web, apps/api, packages/shared, packages/config)
- Auth module (login, refresh, logout) + membership/org context
- Permissions catalog seed + role seed
- Pino logging with requestId and redaction
- Sentry SDK wiring (web + api)
- Basic health endpoints and diagnostics page (optional)

### Verification
- CI passes (lint/typecheck/tests)
- Can create a user, login, refresh token, and hit a protected endpoint

---

## Phase 1 — Organization + Chart of Accounts (Org + CoA)

### User Stories
- US-ORG-01 Create Organization
- US-COA-01 Manage Accounts
- US-AUTH-01 Invite User (minimum invite + membership)

### Scope
- Organization creation + org_settings
- Default system accounts bootstrap
- Chart of accounts UI + APIs
- Basic users listing + invites

### Deliverables
- DB: organizations, org_settings, accounts, roles, permissions, memberships, invites, audit_logs
- API: org create/get/update; accounts list/create/update; user invites/list
- UI: Onboarding wizard; CoA list + create/edit sheet; Users list + invite dialog

### Exit Criteria
- New org is created with seeded roles + default chart of accounts
- CoA can be managed without breaking posting prerequisites

---

## Phase 2 — Master Data (Customers, Vendors, Items, Tax Codes)

### User Stories
- US-CUST-01 Manage Customers
- US-VEND-01 Manage Vendors
- US-ITEM-01 Manage Items
- US-TAX-01 Configure Tax Codes

### Scope
- CRUD with soft deactivation
- Tax codes (VAT) enablement and rules
- Item account mappings required

### Deliverables
- DB: customers, vendors, items, tax_codes (+ audit)
- API: list/create/get/update endpoints for each entity
- UI: tables + sheets for each entity

### Exit Criteria
- Master data exists and is selectable in invoice/bill screens (next phase)

---

## Phase 3 — Sales: Invoices (Draft → Post)

### User Stories
- US-SALES-01 Create Invoice (Draft)
- US-SALES-01b Post Invoice

### Scope
- Invoice editor (line-entry)
- Draft save/update
- Posting engine integration for invoices (GL header + lines)
- Document numbering via org_settings

### Deliverables
- DB: invoices, invoice_lines, gl_headers, gl_lines, idempotency_keys, audit_logs updates
- API: invoice CRUD (draft only); POST /invoices/:id/post (idempotent)
- UI: invoice list; invoice create/edit; invoice view; posting confirmation with ledger preview
- Accounting rules: totals computed server-side; posted invoices immutable

### Exit Criteria
- Posted invoice creates correct double-entry lines and cannot be edited
- Posting is atomic + idempotent

---

## Phase 4 — Sales: Payments Received (Allocation → Post)

### User Stories
- US-SALES-02 Receive Payment (Draft + Post)

### Scope
- Payment received entry + allocation to invoices
- Row locking for outstanding checks
- Posting GL for payments

### Deliverables
- DB: payments_received, payment_received_allocations (+ ledger/audit/idempotency)
- API: payment draft CRUD; POST /payments-received/:id/post
- UI: payments list; receive payment form; allocation UI

### Exit Criteria
- Over-allocation prevented under concurrency
- Invoice outstanding updates correctly (status paid/partial)

---

## Phase 5 — Purchases: Bills (Draft → Post)

### User Stories
- US-PUR-01 Record Bill (Draft)
- US-PUR-01b Post Bill

### Scope
- Bills with expense accounts + VAT receivable logic
- Posting to ledger

### Deliverables
- DB: bills, bill_lines (+ ledger/audit/idempotency)
- API: bill draft CRUD; POST /bills/:id/post
- UI: bills list; bill create/edit; post confirmation with ledger preview

### Exit Criteria
- Bill posting creates correct AP + VAT receivable entries

---

## Phase 6 — Purchases: Vendor Payments (Allocation → Post)

### User Stories
- US-PUR-02 Pay Vendor (Draft + Post)

### Scope
- Vendor payment with allocation to bills
- Locks + outstanding enforcement
- Posting to ledger

### Deliverables
- DB: vendor_payments, vendor_payment_allocations (+ ledger/audit/idempotency)
- API: vendor payment draft CRUD; POST /vendor-payments/:id/post
- UI: vendor payments list; pay bills flow

### Exit Criteria
- Overpay blocked (or recorded as vendor credit in phase 2+ only)

---

## Phase 7 — Journals (Draft → Post)

### User Stories
- US-GL-01 Journal Entry (Draft + Post)

### Scope
- Journal editor (debit/credit lines)
- Balanced enforcement
- Posting to ledger

### Deliverables
- DB: journal_entries, journal_lines (+ ledger/audit/idempotency)
- API: journal draft CRUD; POST /journals/:id/post
- UI: journal list; journal create/edit; post confirmation

### Exit Criteria
- Journal must be balanced and posts exact lines into GL

---

## Phase 8 — Banking & Reconciliation (MVP-lite)

### User Stories
- US-BANK-01 Manage Bank Accounts
- US-BANK-02 Import Bank Statement
- US-BANK-03 Reconcile

### Scope
- Bank accounts (linked to GL bank account)
- Import bank transactions (CSV minimal)
- Basic reconciliation session + manual match to GL headers

### Deliverables
- DB: bank_accounts, bank_transactions, reconciliation_sessions, reconciliation_matches
- API: bank account CRUD; import endpoint; reconciliation endpoints
- UI: bank accounts list; import screen; reconcile screen (split view)

### Exit Criteria
- Can close a reconciliation session with stored matches

---

## Phase 9 — Reports + Audit Log UI

### User Stories
- US-REP-* Reports
- US-AUD-01 Audit Trail

### Scope
- Trial Balance, P&L, Balance Sheet, Aging, VAT summary
- Drill-down support
- Audit log screen with filters

### Deliverables
- API: /reports/* endpoints (read-only)
- UI: report screens + export buttons (CSV/PDF phase 2); audit log screen
- Performance: indexes verified; slow queries instrumented

### Exit Criteria
- Reports match ledger sums; drill-down works; audit trail visible

---

## Phase 10 — Attachments + PDF Generation

### User Stories
- US-DOC-01 Attachments (upload/download)
- (Support work) PDF generation jobs for invoices/receipts

### Scope
- Pre-signed uploads
- Attachment metadata CRUD
- Background PDF generation (BullMQ + Playwright)

### Deliverables
- DB: attachments
- API: signed URL endpoints + attach/list/delete (delete only for draft docs)
- UI: attachments panel on documents
- Jobs: PDF generation to object storage + attach

### Exit Criteria
- Attachments permission-safe; PDFs generated and downloadable

---

## Recommended Build Order Summary

1. Phase 0: Platform Foundation  
2. Phase 1: Org + CoA  
3. Phase 2: Master Data  
4. Phase 3: Invoices  
5. Phase 4: Payments Received  
6. Phase 5: Bills  
7. Phase 6: Vendor Payments  
8. Phase 7: Journals  
9. Phase 8: Banking + Reconcile  
10. Phase 9: Reports + Audit UI  
11. Phase 10: Attachments + PDFs

---

## Phase Handoff Checklist (before starting next phase)

- [ ] All tests passing (unit + integration + e2e for the phase)
- [ ] Migrations applied cleanly on fresh DB
- [ ] Seed scripts updated (if applicable)
- [ ] No TODO/FIXME in posting paths
- [ ] Audit logs confirmed for all critical actions
- [ ] RBAC checks confirmed (UI + API)
- [ ] Observability verified (requestId correlation, Sentry)
