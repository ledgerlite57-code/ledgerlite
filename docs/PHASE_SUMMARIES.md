# Phase Summaries

## Phase 1 - Trust fixes (reports + status + formatting)
Changes:
- TBD (backfill summary once Phase 1 audit is re-validated).

Verification steps:
- TBD

Risk notes:
- TBD

## Phase 2 - Inline validation and errors
Changes:
- Journal lines highlight debit/credit issues and Post is disabled when unbalanced.
- Invoice/Bill lines show inline hints for qty, unit price, discount, and tax selection.
- Payment/Vendor payment allocations show remaining-to-allocate guidance and over-allocation warnings.
- ErrorBanner used to surface API error message + hint.

Files touched:
- `apps/web/app/(protected)/journals/[id]/page.tsx`
- `apps/web/app/(protected)/invoices/[id]/page.tsx`
- `apps/web/app/(protected)/bills/[id]/page.tsx`
- `apps/web/app/(protected)/payments-received/[id]/page.tsx`
- `apps/web/app/(protected)/vendor-payments/[id]/page.tsx`
- `apps/web/tests/phase2.spec.ts`

Verification steps:
1) UI: run `pnpm -C apps/web test -- phase2.spec.ts`
2) Manual: create a journal with unbalanced lines and confirm Post is disabled.
3) Manual: set a payment allocation above invoice outstanding and confirm warning appears.

Risk notes:
- Inline hints are advisory; server-side validation still enforces invariants.

## Phase 3 - Filters and saved views
Changes:
- TBD

Verification steps:
- TBD

Risk notes:
- TBD

## Phase 4 - Sidebar/navigation clarity + badges
Changes:
- TBD

Verification steps:
- TBD

Risk notes:
- TBD

## Phase 5 - Toast feedback + last saved + error normalization
Changes:
- TBD

Verification steps:
- TBD

Risk notes:
- TBD

## Phase 7 - Lock date enforcement
Changes:
- TBD

Verification steps:
- TBD

Risk notes:
- TBD

## Phase 8 - Void/reversal workflows
Changes:
- TBD

Verification steps:
- TBD

Risk notes:
- TBD

## Phase 9 - Inventory v1 + accountant-complete entry
Changes:
- TBD

Verification steps:
- TBD

Risk notes:
- TBD

## Final - Windows on-prem installer
Changes:
- TBD

Verification steps:
- TBD

Risk notes:
- TBD
