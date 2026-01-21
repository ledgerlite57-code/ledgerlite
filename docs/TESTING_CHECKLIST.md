# LedgerLite – Testing & Verification Checklists (v1.0)

This document provides **testing checklists per user story and per phase**.
Use it to verify correctness before merging into `develop/staging/main`.

> **Version:** v1.0  
> **Status:** FROZEN  
> **Audience:** QA, Engineering, Codex

---

## A) Global Test Standards (apply to all phases)

### A.1 Required Test Layers
- **Unit tests**: pure domain logic (totals, VAT calc, posting line builder, permissions evaluator)
- **Integration tests**: NestJS endpoints with real Postgres (Docker) and transactions
- **E2E tests**: Playwright for critical user journeys
- **Manual QA**: checklist verification for UX safety and accounting correctness

### A.2 Required Assertions (every write feature)
- [ ] Zod validation rejects invalid payloads (400) with field errors
- [ ] RBAC blocks unauthorized access (403) at API and hides UI actions
- [ ] Audit log written for create/update/post/void/settings changes
- [ ] Request correlation id exists and appears in logs
- [ ] Idempotency supported for create/post endpoints where required
- [ ] Posted documents become read-only in UI and API (409/422 rule)
- [ ] Concurrency rules verified with locking for allocations/posting

### A.3 Accounting Invariants (must always hold)
- [ ] Every GL header is balanced: totalDebit == totalCredit
- [ ] Every GL line has either debit > 0 OR credit > 0 (not both)
- [ ] Unique posting constraint prevents double posting
- [ ] Posting is atomic (document + GL + audit either all commit or rollback)

---

## B) Phase-by-Phase Verification Checklists

### Phase 0 — Platform Foundation
**Verify**
- [ ] Docker compose up: web/api/db/redis
- [ ] Auth login works; refresh works; logout invalidates refresh
- [ ] Default owner can log in and access the dashboard
- [ ] RBAC guard denies protected endpoints
- [ ] Pino logs are JSON and include requestId
- [ ] Sentry captures an intentional test error (dev only)

---

### Phase 1 — Org + CoA + Users (US-ORG-01, US-COA-01, US-AUTH-01)

#### US-ORG-01 Create Organization
**API/DB**
- [ ] POST /orgs creates org and org_settings
- [ ] Default system accounts created (AR/AP/VAT/Bank/etc)
- [ ] System roles + permissions seeded
- [ ] Owner membership created
- [ ] Audit log created for org creation

**UI**
- [ ] Onboarding wizard validates required fields
- [ ] After creation, user lands in dashboard or CoA

**Tests**
- [ ] Integration: org creation seeds accounts and roles
- [ ] Unit: VAT enabled requires VAT accounts present

#### US-COA-01 Manage Accounts
**Rules**
- [ ] Unique (orgId, code) enforced
- [ ] System accounts cannot change type/subtype
- [ ] Cannot deactivate required system accounts for posting
- [ ] Accounts used in GL cannot be deactivated

**UI**
- [ ] CoA list shows status (active/inactive) and type/subtype
- [ ] Create/edit uses Sheet; deactivate uses confirmation dialog

**Tests**
- [ ] Integration: cannot modify system account type
- [ ] Integration: cannot deactivate account referenced by GL

#### US-AUTH-01 Invite User
- [ ] Invite creates tokenHash and expiry
- [ ] Accept invite creates membership with role
- [ ] Changing role updates permissions immediately
- [ ] Disabling membership blocks API access

---

### Phase 2 — Master Data (US-CUST-01, US-VEND-01, US-ITEM-01, US-TAX-01)

#### US-CUST-01 Customers
- [ ] Create/edit/deactivate customer
- [ ] Search + filters work
- [ ] Customer appears in invoice customer select
- [ ] Audit logs written for create/update/deactivate

#### US-VEND-01 Vendors
- [ ] Create/edit/deactivate vendor
- [ ] Vendor appears in bill vendor select
- [ ] Audit logs written

#### US-ITEM-01 Items
- [ ] Create item requires incomeAccountId and expenseAccountId
- [ ] Inactive items cannot be selected on new docs (or warn)
- [ ] Defaults apply to invoice/bill lines

#### US-TAX-01 Tax Codes
- [ ] VAT disabled hides tax UI and blocks taxCode usage in API
- [ ] VAT enabled calculates tax consistently
- [ ] Rounding rules verified (line vs total)

---

### Phase 3 — Invoices (US-SALES-01, US-SALES-01b)

#### US-SALES-01 Invoice Draft
- [ ] Create draft invoice with lines
- [ ] Totals computed server-side and returned
- [ ] Draft can be edited; line ordering preserved
- [ ] Cannot set status=POSTED via update endpoint
- [ ] Audit logs exist for create/update

#### US-SALES-01b Post Invoice
**Happy path**
- [ ] Post confirmation shows ledger preview
- [ ] Post creates GL header + balanced lines
- [ ] Invoice status becomes POSTED and becomes read-only
- [ ] Invoice number assigned from org_settings sequence

**Edge cases**
- [ ] Posting fails if required accounts missing
- [ ] Posting fails if VAT enabled but VAT accounts missing
- [ ] Posting is idempotent: same Idempotency-Key returns same response
- [ ] Second post attempt blocked by UNIQUE posting constraint

**Concurrency**
- [ ] Two parallel post requests do not create double GL entries

---

### Phase 4 — Payments Received (US-SALES-02)

#### US-SALES-02 Payment Draft
- [ ] Create payment draft with allocations
- [ ] Cannot allocate to invoices from other org/customer
- [ ] AmountTotal equals sum of allocations (or validated rule)

#### Post Payment
- [ ] Locks invoice rows FOR UPDATE
- [ ] Blocks over-allocation if invoice outstanding changed
- [ ] GL posting: Dr Bank/Cash, Cr AR
- [ ] Invoice paid status updates (partial/paid)

---

### Phase 5 — Bills (US-PUR-01, US-PUR-01b)

#### Bill Draft
- [ ] Create draft bill with lines and expense accounts
- [ ] Totals computed server-side
- [ ] Audit logs created

#### Post Bill
- [ ] Ledger: Dr Expense, Dr VAT Receivable, Cr AP
- [ ] Cannot post if AP/VAT accounts missing
- [ ] Idempotency enforced and double-post blocked

---

### Phase 6 — Vendor Payments (US-PUR-02)

#### Payment Draft
- [ ] Create draft vendor payment with allocations
- [ ] Allocations cannot exceed outstanding

#### Post Vendor Payment
- [ ] Lock bill rows FOR UPDATE
- [ ] Ledger: Dr AP, Cr Bank/Cash
- [ ] Overpayment blocked (vendor credit is phase 2)

---

### Phase 7 — Journals (US-GL-01)

#### Journal Draft
- [ ] Create journal entry with lines
- [ ] UI balance indicator shows difference (must be zero to post)

#### Post Journal
- [ ] Debit == credit enforced server-side
- [ ] GL posting mirrors journal lines exactly
- [ ] Idempotent posting and double-post blocked

---

### Phase 8 — Banking & Reconciliation (US-BANK-01/02/03)

#### Bank Accounts
- [ ] Bank account requires linked GL bank account
- [ ] Deactivate bank account blocks selection for payments

#### Import Bank Transactions
- [ ] Import creates bank_transactions rows
- [ ] Dedup rule works (externalRef when present)
- [ ] Import errors produce a validation report (phase 2 optional)

#### Reconcile
- [ ] Create reconciliation session
- [ ] Match bank txn to GL header
- [ ] Close session locks matches (no edits after close)
- [ ] Audit logs created for open/close/match

---

### Phase 9 — Reports + Audit UI (US-REP-*, US-AUD-01)

#### Reports
- [ ] Trial Balance sums: total debit == total credit
- [ ] P&L and Balance Sheet reconcile with TB
- [ ] Aging uses allocations and matches invoice/bill outstanding
- [ ] VAT summary matches postings

#### Drill-down
- [ ] Click report row opens underlying transactions filtered

#### Audit Log
- [ ] Filters: date range, actor, entity type
- [ ] Displays before/after for critical actions

---

### Phase 10 — Attachments + PDFs (US-DOC-01)

#### Attachments
- [ ] Pre-signed upload URL requires permission
- [ ] File uploaded to storage, metadata saved in DB
- [ ] Download requires permission and uses pre-signed URL
- [ ] Attachment list visible on entity screen
- [ ] Delete only allowed for draft docs (or admin rules)

#### PDFs
- [ ] Post invoice triggers PDF job (if enabled)
- [ ] PDF stored in storage and linked as attachment
- [ ] PDF download works

---

## C) Regression Suite (run before every release)

### C.1 Core Financial Regression
- [ ] Create/post invoice
- [ ] Receive partial payment + final payment
- [ ] Create/post bill
- [ ] Pay vendor partially + final
- [ ] Create/post journal
- [ ] Trial Balance balanced after all above
- [ ] VAT summary matches expected input/output VAT

### C.2 Security Regression
- [ ] Viewer cannot create/edit/post anything
- [ ] Sales cannot access purchases posting endpoints
- [ ] Purchases cannot access sales posting endpoints
- [ ] RBAC enforced on API even if UI is bypassed

### C.3 Data Integrity Regression
- [ ] Attempt to edit posted docs is blocked
- [ ] Attempt to double-post blocked
- [ ] Idempotency returns same response on retry
- [ ] Audit logs exist for all critical actions

---

## D) Release Readiness Checklist

- [ ] All migrations applied successfully in staging on fresh DB
- [ ] Seed scripts stable and repeatable
- [ ] All tests passing in CI
- [ ] Sentry has no new untriaged critical errors
- [ ] Grafana dashboards show stable error rates and latency
- [ ] Backup/restore procedure validated (phase 2 for SaaS hardening)
