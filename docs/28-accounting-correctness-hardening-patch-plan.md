# 28 - Accounting Correctness Hardening (Patch Plan + Phase-by-Phase Tasks)

## Executive summary

Issue counts (high-impact correctness/integrity):
- CRITICAL: 2
- HIGH: 9
- MEDIUM: 2

Top 5 risks that can corrupt financial statements / mislead users:
1) Inventory/COGS as-of date logic wrong for backdated invoices.
2) Dashboard totals flip after reversal due to status filtering.
3) AR/AP aging ignores credit notes and other adjustments.
4) Void/bounce flows update amountPaid without row locks.
5) Cash-basis reports drift and include CREDIT_NOTE accrual postings.

---

## Accounting model & posting pipeline (sources of truth + entry points)

Sources of truth:
- Ledger: `GLHeader` + `GLLine` (`apps/api/prisma/schema.prisma` ~983-1034)
- Unique per org/source: `@@unique([orgId, sourceType, sourceId])` (~1006)

Posting entry points (examples):
- Invoice: `POST /invoices/:id/post` -> `InvoicesController.postInvoice` -> `InvoicesService.postInvoice`
  -> `buildInvoicePostingLines` (`apps/api/src/modules/invoices/invoices.utils.ts` ~141-232)
  -> `tx.gLHeader.create` (`apps/api/src/modules/invoices/invoices.service.ts` ~693-720)
  -> inventory movements created (`~1127-1239`)

Other flows:
- Bills, payments, vendor payments, expenses, journals, credit notes, PDC: similar service patterns using `assertGlLinesValid()` and writing `GLHeader/GLLine`.

---

## Phase 0 (P0) - Hotfixes (financial statement integrity blockers)

### US-ACC-001 - Dashboard correctness after void/reversal

Target files (evidence):
- `apps/api/src/modules/dashboard/dashboard.service.ts` (~82-98, ~130-143, ~167-186)
- `apps/api/src/common/gl-reversal.ts` (~69-113)

Tasks:
| Task ID | Task | Owner | Est. | Depends | Suggested Files | Tests |
| --- | --- | --- | ---: | --- | --- | --- |
| ACC-001-T01 | Update dashboard queries to include REVERSED (or exclude only DRAFT) consistently | Backend | 0.5d | None | `dashboard.service.ts` | - |
| ACC-001-T02 | Add dashboard reversal regression test | Backend/QA | 0.75d | T01 | new `dashboard.service.spec.ts` | unit/integration |
| ACC-001-T03 | Add inline comment documenting status semantics for dashboard | Backend | 0.1d | T01 | `dashboard.service.ts` | - |

Definition of Done:
- Dashboard totals do not change after post + reversal for cash/bank/P&L scenarios.

---

### US-ACC-002 - Inventory/COGS effective date correctness for invoices

Target files (evidence):
- `apps/api/src/common/inventory-cost.ts` (~129-141)
- `apps/api/src/modules/invoices/invoices.service.ts` (~656-668, ~1127-1239)
- `apps/api/prisma/schema.prisma` (`InventoryMovement.createdAt` default now)

Decision point:
- Preferred: add explicit `effectiveAt` to `InventoryMovement` and use it for cutoff.
- Interim: set `createdAt = invoice.invoiceDate` (documented as temporary).

Tasks (preferred path):
| Task ID | Task | Owner | Est. | Depends | Suggested Files | Tests |
| --- | --- | --- | ---: | --- | --- | --- |
| ACC-002-T01 | Add `effectiveAt` to InventoryMovement + migration/backfill | Backend | 1.0d | None | `schema.prisma`, migration | - |
| ACC-002-T02 | Set effectiveAt for invoice/bill/credit-note movements | Backend | 0.75d | T01 | `invoices.service.ts`, `bills.service.ts`, `credit-notes.service.ts` | - |
| ACC-002-T03 | Update inventory-cost cutoff to use effectiveAt | Backend | 0.5d | T01 | `inventory-cost.ts` | - |
| ACC-002-T04 | Update negative stock check to use as-of effectiveAt | Backend | 0.5d | T03 | `invoices.service.ts` | - |
| ACC-002-T05 | Add regression tests for backdated invoices | Backend/QA | 0.75d | T02-T04 | `inventory-cost.spec.ts` | unit |

Definition of Done:
- Backdated invoices affect inventory/COGS in the correct historical period.

---

## Phase 1 (P1) - Reports correctness (cash-basis + aging)

### US-ACC-101 - Cash-basis rounding reconciliation

Target files (evidence):
- `apps/api/src/modules/reports/reports.service.ts` (~70-175)

Tasks:
| Task ID | Task | Owner | Est. | Depends | Suggested Files | Tests |
| --- | --- | --- | ---: | --- | --- | --- |
| ACC-101-T01 | Implement cent-based allocation with deterministic remainder distribution | Backend | 0.75d | None | `reports.service.ts` | - |
| ACC-101-T02 | Add rounding reconciliation tests | Backend/QA | 0.75d | T01 | `reports.cash-basis.rounding.spec.ts` | unit |

---

### US-ACC-102 - Cash-basis filtering excludes accrual-only docs

Target files (evidence):
- `apps/api/src/modules/reports/reports.service.ts` (~178-190)

Tasks:
| Task ID | Task | Owner | Est. | Depends | Suggested Files | Tests |
| --- | --- | --- | ---: | --- | --- | --- |
| ACC-102-T01 | Exclude CREDIT_NOTE (and other accrual docs) from baseGrouped | Backend | 0.25d | None | `reports.service.ts` | - |
| ACC-102-T02 | Add credit-note cash-basis regression test | Backend/QA | 0.5d | T01 | `reports.cash-basis.credit-notes.spec.ts` | unit |

---

### US-ACC-103 - AR/AP aging reconciles to GL (credit notes + adjustments)

Target files (evidence):
- AR aging: `reports.service.ts` (~767-850)
- AP aging: `reports.service.ts` (~879-963)
- `CreditNote.invoiceId` in schema: `schema.prisma` (~639-669)

Tasks (depends on credit note applications):
| Task ID | Task | Owner | Est. | Depends | Suggested Files | Tests |
| --- | --- | --- | ---: | --- | --- | --- |
| ACC-103-T01 | Include credit applications in AR/AP aging | Backend | 0.75d | ACC-201-T02 | `reports.service.ts` | - |
| ACC-103-T02 | Add AR/AP aging reconciliation tests | Backend/QA | 0.75d | T01 | `reports.ar-aging.credit-notes.spec.ts` | unit |

---

## Phase 2 (P1/P2) - Subledger integrity + lifecycle rules

### US-ACC-201 - Credit note application model

Tasks:
| Task ID | Task | Owner | Est. | Depends | Suggested Files | Tests |
| --- | --- | --- | ---: | --- | --- | --- |
| ACC-201-T01 | Add CreditNoteAllocation schema + migration | Backend | 1.0d | None | `schema.prisma`, migration | - |
| ACC-201-T02 | Add apply/unapply API with idempotency | Backend | 1.0d | T01 | credit note service/controller | integration |
| ACC-201-T03 | Update invoice/bill outstanding computation to include credits | Backend | 0.75d | T02 | invoices/bills service | unit |
| ACC-201-T04 | Block invoice/bill void when applied credits exist | Backend | 0.5d | T02 | invoices/bills service | unit |
| ACC-201-T05 | Add UI hooks (if needed) for credit application | Frontend | 1.0d | T02 | invoice/bill UI | e2e |

---

### US-ACC-202 - Opening balance posting correctness

Tasks:
| Task ID | Task | Owner | Est. | Depends | Suggested Files | Tests |
| --- | --- | --- | ---: | --- | --- | --- |
| ACC-202-T01 | Allow zero/negative opening balance postings with correct sign | Backend | 0.5d | None | `bank-accounts.service.ts` | unit |
| ACC-202-T02 | Enforce lock date for opening balance posting | Backend | 0.25d | T01 | `bank-accounts.service.ts` | unit |
| ACC-202-T03 | Remove or gate dashboard openingBalance fallback | Backend | 0.5d | T01 | `dashboard.service.ts` | unit |

---

## Phase 3 (P1) - Concurrency + reconciliation safety

### US-ACC-301 - Row-lock derived balance updates on void/bounce flows

Tasks:
| Task ID | Task | Owner | Est. | Depends | Suggested Files | Tests |
| --- | --- | --- | ---: | --- | --- | --- |
| ACC-301-T01 | Add SELECT FOR UPDATE in payment void flows | Backend | 0.5d | None | `payments-received.service.ts` | - |
| ACC-301-T02 | Add SELECT FOR UPDATE in vendor payment void flows | Backend | 0.5d | None | `vendor-payments.service.ts` | - |
| ACC-301-T03 | Add SELECT FOR UPDATE in PDC bounce/clear flows | Backend | 0.5d | None | `pdc.service.ts` | - |
| ACC-301-T04 | Add concurrency regression test | Backend/QA | 1.0d | T01-T03 | new integration test | integration |

---

### US-ACC-302 - Reconciliation matching concurrency safety

Tasks:
| Task ID | Task | Owner | Est. | Depends | Suggested Files | Tests |
| --- | --- | --- | ---: | --- | --- | --- |
| ACC-302-T01 | Lock bank transaction row during match | Backend | 0.5d | None | `reconciliation-sessions.service.ts` | - |
| ACC-302-T02 | Add parallel match regression test | Backend/QA | 0.75d | T01 | integration test | integration |

---

## Phase 4 (P2) - Precision + ledger guardrails

### US-ACC-401 - Inventory unit cost precision upgrade

Tasks:
| Task ID | Task | Owner | Est. | Depends | Suggested Files | Tests |
| --- | --- | --- | ---: | --- | --- | --- |
| ACC-401-T01 | Increase InventoryMovement.unitCost precision | Backend | 0.75d | None | `schema.prisma`, migration | - |
| ACC-401-T02 | Remove premature rounding in cost math | Backend | 0.5d | T01 | `inventory-cost.ts`, `bills.service.ts` | unit |
| ACC-401-T03 | Add precision regression tests | Backend/QA | 0.75d | T02 | inventory tests | unit |

---

### US-ACC-402 - GL integrity guardrails

Tasks:
| Task ID | Task | Owner | Est. | Depends | Suggested Files | Tests |
| --- | --- | --- | ---: | --- | --- | --- |
| ACC-402-T01 | Implement integrity audit query (headers vs lines) | Backend | 0.5d | None | new audit job/service | unit |
| ACC-402-T02 | Add alert/logging output for integrity failures | Backend/Platform | 0.5d | T01 | logger + alert hooks | - |
| ACC-402-T03 | (Optional) Add DB trigger/constraint after audit is stable | Backend | 1.0d | T01 | migration | - |

---

## Recommended sprint order

Sprint A (P0)
1) US-ACC-001
2) US-ACC-002

Sprint B (P1)
3) US-ACC-101
4) US-ACC-102

Sprint C (P1/P2)
5) US-ACC-201
6) US-ACC-103
7) US-ACC-202

Sprint D (P1)
8) US-ACC-301
9) US-ACC-302

Sprint E (P2)
10) US-ACC-401
11) US-ACC-402

---

## Patch gating / rollout flags

If we need safe rollouts in prod, prefer environment flags for:
- inventory effective-date logic (already present in env examples)
- negative stock policy behavior
- dashboard status semantics (temporary flag if required)
- cash-basis filtering/rounding (flag until validated with accounting users)

