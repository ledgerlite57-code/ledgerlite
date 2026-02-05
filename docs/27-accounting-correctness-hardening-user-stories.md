# 27 - Accounting Correctness Hardening (Audit-Driven User Stories)

## Purpose

Convert the highest-impact accounting correctness findings into implementation-ready user stories with evidence, acceptance criteria, tests, and rollout notes.

Implementation task breakdown:
- `docs/28-accounting-correctness-hardening-patch-plan.md`

---

## Audit snapshot (Feb 2026)

Issue counts (high-impact correctness/integrity):
- CRITICAL: 2
- HIGH: 9
- MEDIUM: 2

Top 5 risks that can corrupt financial statements / mislead users:
1) Inventory/COGS as-of date logic wrong for backdated invoices -> incorrect valuation and COGS in historical periods.
2) Dashboard cash/bank/net profit flips after reversal because originals become REVERSED but reversals remain POSTED.
3) AR/AP aging based on Invoice/Bill totals + payment allocations ignores credit notes and other adjustments.
4) Void/bounce flows update amountPaid without row locks -> race conditions corrupt receivable/payable balances.
5) Cash-basis reports have rounding drift and include CREDIT_NOTE accrual postings -> wrong cash-basis P&L/VAT.

---

## Traceability

Primary evidence sources (line references in audit):
- `apps/api/src/modules/dashboard/dashboard.service.ts`
- `apps/api/src/common/gl-reversal.ts`
- `apps/api/src/common/inventory-cost.ts`
- `apps/api/src/modules/invoices/invoices.service.ts`
- `apps/api/src/modules/reports/reports.service.ts`
- `apps/api/src/modules/payments-received/payments-received.service.ts`
- `apps/api/src/modules/vendor-payments/vendor-payments.service.ts`
- `apps/api/src/modules/pdc/pdc.service.ts`
- `apps/api/src/modules/reconciliation-sessions/reconciliation-sessions.service.ts`
- `apps/api/prisma/schema.prisma`

Related story inventories:
- `docs/11-accounting-user-stories.md` (section: "Accounting logic issues observed")

---

## Severity model

- P0 / CRITICAL: can materially corrupt balances/P&L or mislead users.
- P1 / HIGH: produces report/subledger drift or race conditions that corrupt derived balances.
- P2 / MEDIUM: precision and guardrails (long-term integrity).

---

## Epic ACC-0: Financial Statement Integrity Hotfixes (P0)

### US-ACC-001 - Dashboard correctness after void/reversal (status semantics)

Story:
As a finance user, I want dashboard totals (cash/bank/net profit) to remain correct after voids/reversals so I can trust dashboard numbers.

Evidence (code refs):
- Dashboard filters `GLHeader.status = POSTED` in:
  - bank groups: `apps/api/src/modules/dashboard/dashboard.service.ts` (~82-98)
  - cash groups: (~130-143)
  - P&L groups: (~167-186)
- Reversal logic: `apps/api/src/common/gl-reversal.ts` (~69-113)
  - reversal header stays POSTED, original becomes REVERSED

Failure modes:
- Post cash receipt -> void -> dashboard excludes original and includes reversal, flipping totals.

Acceptance Criteria:
1) Dashboard totals net to zero after reversal (no sign flip).
2) Status inclusion rule is explicit and consistent across cash/bank/P&L.
3) Regression tests cover reversal of income and expense scenarios.

Tests to add:
- `apps/api/src/modules/dashboard/dashboard.service.spec.ts` (new)
  - post + reverse -> totals unchanged

Rollout:
- If required, add an environment flag to switch status inclusion policy.

---

### US-ACC-002 - Inventory/COGS effective date correctness for invoices (backdated posting)

Story:
As finance, I want inventory movements and cost resolution to respect document effective dates so backdated invoices post correct historical stock and COGS.

Evidence (code refs):
- Cost cutoff uses `createdAt` for INVOICE: `apps/api/src/common/inventory-cost.ts` (~129-141)
- Invoice requests cost as-of invoiceDate: `apps/api/src/modules/invoices/invoices.service.ts` (~656-668)
- Invoice movements created without createdAt override (defaults now): `apps/api/src/modules/invoices/invoices.service.ts` (~1127-1239)
- `InventoryMovement.createdAt` default now(): `apps/api/prisma/schema.prisma` (~592)

Failure modes:
- Backdated invoice (invoiceDate earlier than posting date) is excluded from as-of stock and cost.

Acceptance Criteria:
1) When effective-date costing enabled, invoice movements use the invoice date for cutoff.
2) Backdated invoices affect historical inventory/COGS correctly.
3) Negative stock checks use as-of invoice date when effective costing is enabled.
4) Tests cover backdated scenarios with future receipts.

Tests to add:
- Extend `apps/api/src/common/inventory-cost.spec.ts`:
  - receipt on Feb 1, invoice dated Jan 10 posted Feb 10 -> as-of Jan 31 includes invoice issue

Rollout:
- Prefer explicit `effectiveAt` column for correctness and future-proofing.

---

## Epic ACC-1: Reports Correctness (Cash-basis + Aging) (P1)

### US-ACC-101 - Cash-basis rounding reconciliation (no cents drift)

Story:
As finance, I want cash-basis recognition to reconcile exactly to payment allocations so no cents drift accumulates.

Evidence (code refs):
- Cash-basis adjustments: `apps/api/src/modules/reports/reports.service.ts` (~70-175)
  - ratio-based rounding per-line with no remainder reconciliation

Failure modes:
- Partial payments on multi-line invoices drift by cents; P&L/VAT mismatch with payment amount.

Acceptance Criteria:
1) netRecognized + taxRecognized == allocationAmount in cents.
2) sum(perLineNetRecognized) == netRecognized.
3) deterministic remainder distribution documented.

Tests to add:
- `reports.cash-basis.rounding.spec.ts`
  - multi-line + partial payment -> exact cent reconciliation

---

### US-ACC-102 - Cash-basis base ledger filtering excludes accrual-only docs

Story:
As finance, I want cash-basis P&L to exclude accrual-only GL postings (e.g., credit notes without cash events).

Evidence (code refs):
- Base ledger grouping excludes only INVOICE/BILL: `apps/api/src/modules/reports/reports.service.ts` (~178-190)
- Credit notes post to AR/Revenue: `apps/api/src/modules/credit-notes/credit-notes.service.ts` (posting lines ~658-686)

Failure modes:
- Credit note posted without refund reduces cash-basis revenue incorrectly.

Acceptance Criteria:
1) Credit notes (and other accrual-only docs) are excluded from cash-basis baseGrouped.
2) Tests cover credit note without refund -> no cash-basis impact.

---

### US-ACC-103 - AR/AP aging reconciles to GL (credit notes + adjustments)

Story:
As collections/AP, I want aging to reflect all settlements/adjustments so aging reconciles to AR/AP control accounts.

Evidence (code refs):
- AR aging uses invoice.total - payment allocations only: `apps/api/src/modules/reports/reports.service.ts` (~767-850)
- AP aging uses bill.total - payment allocations only: (~879-963)
- Credit notes can link to invoice but not applied: `apps/api/prisma/schema.prisma` (~639-669)

Failure modes:
- Invoice 100 + credit note 20 applied -> aging still shows 100.

Acceptance Criteria:
1) Aging includes payments + credit applications + cleared PDC (if present).
2) Totals reconcile to AR/AP control accounts.
3) Tests cover invoice + credit + payment scenarios.

---

## Epic ACC-2: Posting Lifecycle + Subledger Integrity (P1)

### US-ACC-201 - Credit note application model (reduce outstanding)

Story:
As finance, I want to apply credit notes to invoices/bills so outstanding balances and aging are correct.

Evidence (code refs):
- Credit note creation only checks invoice exists: `apps/api/src/modules/credit-notes/credit-notes.service.ts` (~162-167)
- Invoice void checks only payments: `apps/api/src/modules/invoices/invoices.service.ts` (~859-868)
- Schema has CreditNote.invoiceId but no application model: `apps/api/prisma/schema.prisma` (~639-669)

Acceptance Criteria:
1) Credit notes can be applied partially or fully.
2) Applications are auditable and idempotent.
3) Invoice/bill outstanding reflects payments + credit applications.
4) Invoice/bill void is blocked when applied credits exist.

Tests to add:
- `invoices.void.spec.ts` (block void)
- credit application + aging tests

---

### US-ACC-202 - Opening balance posting correctness (0/negative + lock date)

Story:
As finance, I want opening balances to be posted correctly for zero/negative values and respect lock dates.

Evidence (code refs):
- Only posts if opening > 0: `apps/api/src/modules/bank-accounts/bank-accounts.service.ts` (~244-256)
- Always debits bank/credits equity: (~309-325)
- No lock date enforcement: (~281-355)
- Dashboard fallback adds openingBalance outside GL: `apps/api/src/modules/dashboard/dashboard.service.ts` (~73-115)

Acceptance Criteria:
1) Negative opening balances are posted with correct sign (credit bank / debit equity).
2) Opening posting respects lock dates.
3) Dashboard uses GL-only (no fallback mismatch).

Tests to add:
- Opening balance negative + lock date tests

---

## Epic ACC-3: Concurrency + Data Integrity Hardening (P1)

### US-ACC-301 - Row-lock derived balance updates on void/bounce flows

Evidence (code refs):
- Payment post locks invoices: `payments-received.service.ts` (~486-491)
- Payment void updates without lock: (~762-796)
- Vendor payment post locks bills: `vendor-payments.service.ts` (~487-492)
- Vendor payment void updates without lock: (~775-797)
- PDC bounce updates without lock: `pdc.service.ts` (~1030-1111)

Acceptance Criteria:
1) All void/bounce flows lock affected invoices/bills before recompute.
2) Derived balances match allocations under concurrency.

Tests to add:
- Parallel void/bounce regression tests

---

### US-ACC-302 - Reconciliation matching concurrency safety

Evidence (code refs):
- Remaining calculations via aggregates without locks: `reconciliation-sessions.service.ts` (~306-345)

Acceptance Criteria:
1) Bank transaction row is locked during match creation.
2) Overmatch cannot occur under concurrent requests.

Tests to add:
- Parallel match test

---

## Epic ACC-4: Money/Precision + Ledger Guardrails (P2)

### US-ACC-401 - Inventory movement precision upgrade (unit cost)

Evidence (code refs):
- `InventoryMovement.unitCost Decimal(18,2)` in `schema.prisma` (~582-600)
- `round2` used in cost engine: `apps/api/src/common/inventory-cost.ts` (~143-153)
- Bill unit cost forced to 2dp: `apps/api/src/modules/bills/bills.service.ts` (~40-49)

Acceptance Criteria:
1) unitCost precision increased (>= 6dp).
2) GL postings still round to currency precision.
3) Migration preserves existing values.

---

### US-ACC-402 - GL integrity guardrails (DB-level or audit job)

Evidence (code refs):
- GL schema has no DB-level constraints to guarantee header/line sums: `apps/api/prisma/schema.prisma` (~983-1034)

Acceptance Criteria:
1) Detects per-header debit != credit.
2) Detects header totals != sum(lines).
3) Fails loudly (alerts/logs) or prevents corruption.

---

## Cross-cutting acceptance criteria

- No change should introduce double-entry imbalance.
- All fixes must be covered by regression tests.
- All fixes must be auditable (logs/notes where relevant).

