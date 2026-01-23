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
- Added lock date guard helper and error code for consistent API responses.
- Enforced lock date checks in invoice, bill, payment received, vendor payment, and journal update/post flows.
- Added UI lock date warning and disabled save/post actions when doc date is locked.
- Seeded a lock-date org/user for UI validation and added API/UI e2e coverage.

Verification steps:
1) API: run `pnpm -C apps/api test:e2e -- phase7.lock-date.e2e-spec.ts`
2) UI: run `pnpm -C apps/web test -- phase7.spec.ts`
3) Manual: set a doc date on/before lock date and confirm save/post is blocked.

Risk notes:
- Lock date comparisons use UTC timestamps; verify behavior around timezone boundaries.

## Phase 8 - Void/reversal workflows
Changes:
- Added GL reversal helper and void endpoints for invoices, bills, payments received, vendor payments, and journals.
- Void actions create reversal GL headers, mark documents VOID, and record audit logs.
- Payment voids reverse allocations and recompute invoice/bill payment status.
- UI adds void confirmation dialogs with API error handling.
- Added API + UI tests for void workflows.

Verification steps:
1) API: run `pnpm -C apps/api test:e2e -- phase8.void.e2e-spec.ts`
2) UI: run `pnpm -C apps/web test -- phase8.spec.ts`
3) Manual: post and void a document; confirm reversal GL and VOID status.

Risk notes:
- Reversal GL headers use synthetic source IDs (REVERSAL:<headerId>); ensure downstream reporting filters use `reversedByHeaderId`.

## Phase 9 - Inventory v1 + accountant-complete entry
Changes:
- Added item inventory fields (track inventory, reorder point, opening qty/value) and SKU index, plus invoice/bill reference fields.
- Invoice lines now allow optional income account overrides (validated + honored in posting).
- Item quick-create dialog available from invoice/bill line item pickers.
- Advanced sections added to invoices/bills for reference + exchange rate + VAT helper notes.
- Bill expense account picker upgraded with search, favorites, and recent accounts.
- UI mode toggle (Simple vs Accountant) added in dashboard overview.
- Items dashboard now auto-filters on search and exposes inventory fields in the item form.
- Added Phase 9 Playwright coverage.

Files touched:
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260305090000_phase9_inventory/migration.sql`
- `apps/api/src/modules/items/items.service.ts`
- `apps/api/src/modules/invoices/invoices.service.ts`
- `apps/api/src/modules/bills/bills.service.ts`
- `apps/api/src/invoices.utils.ts`
- `packages/shared/src/schemas/items.ts`
- `packages/shared/src/schemas/invoices.ts`
- `packages/shared/src/schemas/bills.ts`
- `apps/web/src/lib/ui-item-combobox.tsx`
- `apps/web/src/lib/ui-account-combobox.tsx`
- `apps/web/src/lib/ui-item-quick-create.tsx`
- `apps/web/src/lib/use-ui-mode.ts`
- `apps/web/app/(protected)/invoices/[id]/page.tsx`
- `apps/web/app/(protected)/bills/[id]/page.tsx`
- `apps/web/src/features/dashboard/use-dashboard-state.tsx`
- `apps/web/src/features/dashboard/dashboard-sections.tsx`
- `apps/web/tests/phase9.spec.ts`

Verification steps:
1) DB: apply migration `20260305090000_phase9_inventory` (manual SQL if Prisma CLI is unavailable).
2) UI: run `pnpm -C apps/web test -- phase9.spec.ts`
3) Manual: create invoice/bill, open Advanced, set reference/exchange rate, and verify saved values.
4) Manual: create item with track inventory enabled and confirm fields persist.

Risk notes:
- Quick-create item relies on available income/expense accounts; ensure chart of accounts is seeded in fresh orgs.
- Manual migration added due to Prisma CLI download failure; verify against target DB before release.

## Final - Windows on-prem installer
Changes:
- TBD

Verification steps:
- TBD

Risk notes:
- TBD
