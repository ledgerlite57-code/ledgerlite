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
- FilterRow component applied to invoice, bill, payment received, vendor payment, and journal lists.
- List filters persist to URL query params with shared filter helpers.
- Saved views API + UI menu allow saving, applying, and managing list filters.

Verification steps:
1) API: run `pnpm -C apps/api test:e2e -- saved-views.e2e-spec.ts`
2) UI: run `pnpm -C apps/web test -- saved-views.spec.ts`
3) Manual: apply filters on invoices list and confirm URL params persist.

Risk notes:
- Filter query expansion adds more list query paths; monitor performance with large datasets.

## Phase 4 - Sidebar/navigation clarity + badges
Changes:
- Sidebar navigation grouped with icons for Sales, Purchases, Banking, Accounting, Reports, and Settings.
- Draft count badges shown for invoices, payments received, bills, vendor payments, and journals.
- Added `/orgs/sidebar-counts` endpoint to serve draft counts.

Verification steps:
1) API: run `pnpm -C apps/api test:e2e -- sidebar-counts.e2e-spec.ts`
2) UI: run `pnpm -C apps/web test -- phase4.spec.ts`
3) Manual: confirm badges appear only when drafts exist.

Risk notes:
- Sidebar counts add extra DB queries on load; monitor performance for large orgs.

## Phase 5 - Toast feedback + last saved + error normalization
Changes:
- Toast feedback on save/post/import/reconcile flows across core modules.
- “Last saved at” and “Posted at” timestamps shown on detail pages.
- Client error normalization surfaces API hints in ErrorBanner and toasts.

Verification steps:
1) UI: run `pnpm -C apps/web test -- phase5.spec.ts`
2) Manual: save/post an invoice or bill and confirm success toast + last-saved text updates.

Risk notes:
- Toast notifications are in-memory; refresh clears pending messages.

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
