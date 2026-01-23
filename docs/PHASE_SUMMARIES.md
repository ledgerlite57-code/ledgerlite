# Phase Summaries

## Phase 1 - Trust fixes (reports + status + formatting)
Changes:
- Balance sheet now returns derived equity (net profit for fiscal year to date) and computed equity.
- Equity section always renders with "Net Profit (Loss) (derived)" and computed equity line.
- StatusChip component used on list + detail pages for invoices, bills, payments received, vendor payments, and journals.
- formatMoney now shows currency code; formatDate is consistent; parseApiDecimalSafely added.
- Multi-currency warning shown when document currency differs from org base currency.
- Loading and empty state text aligned on touched list pages.
- Tests: API e2e for balance sheet derived equity, Playwright check for derived equity line.

Verification steps:
1) API: run `pnpm -C apps/api test -- reports.balance-sheet.e2e-spec.ts`
2) UI: run `pnpm -C apps/web test -- phase1.extra.spec.ts`
3) Manual: open Balance Sheet and confirm equity shows derived net profit and totals align.

Risk notes:
- Currency display now includes code; verify exports or PDFs if they assume symbols only.
- Fiscal year start month affects net profit range; confirm org setting is correct.

## Phase 2 - Inline validation and errors
Changes:
- Journal line validation with live balancing, inline debit/credit hints, and Post disabled when invalid or unbalanced.
- Inline line totals for invoices and bills, totals summary moved to the top of forms.
- Allocation helpers for payments and vendor payments (remaining to allocate + over-allocation warnings).
- Decimal-safe UI math using minor-unit helpers for draft totals and allocations.
- ErrorBanner component with normalized messaging on detail pages.

Verification steps:
1) UI: create a journal draft with unbalanced lines; confirm "Unbalanced by" appears and Post is disabled.
2) UI: add invoice/bill lines and confirm per-line subtotal/tax/total updates and header totals match.
3) UI: allocate a payment over an invoice balance; confirm over-allocation warning appears.
4) Playwright: `pnpm -C apps/web test -- phase2.spec.ts`

Risk notes:
- Integer-based calculations assume 2-decimal currencies; review if 0/3-decimal currencies are added.

## Phase 3 - Filters and saved views
Changes:
- Reusable FilterRow with URL-persisted filters across invoice, bill, payment, vendor payment, and journal lists.
- Saved views model + API + UI (save/apply per user/org).
- List APIs accept date range + amount range filters, backed by shared date range helper.
- Tests: API saved views isolation + Playwright saved views flow.

Verification steps:
1) API: `pnpm -C apps/api test:e2e -- saved-views.e2e-spec.ts`
2) UI: `pnpm -C apps/web test:e2e -- saved-views.spec.ts`
3) UI: `pnpm -C apps/web test:e2e -- phase3.spec.ts`
4) Manual: apply filters on a list page and confirm URL params persist.

Risk notes:
- Additional list filters add query paths; confirm indexes if filter-heavy usage grows.

## Phase 4 - Sidebar navigation and badges
Changes:
- Grouped sidebar navigation with icons and report sub-links.
- Draft count badges for invoices, payments received, bills, vendor payments, and journals.
- New `/orgs/sidebar-counts` endpoint gated by org + module permissions.
- Tests: API sidebar counts + Playwright sidebar groups/links.

Verification steps:
1) API: `pnpm -C apps/api test:e2e -- sidebar-counts.e2e-spec.ts`
2) UI: `pnpm -C apps/web test:e2e -- phase4.spec.ts`

Risk notes:
- Sidebar counts add extra DB queries on load; monitor orgs with large draft volumes.

## Phase 5 - Feedback, last saved, API errors
Changes:
- Toasts for save/post/import/reconcile actions with error hints for failures.
- "Last saved at" and "Posted at" timestamps on invoice, bill, payment, vendor payment, and journal detail pages.
- API error responses include hints and client normalization surfaces them in banners/toasts.
- Tests: API error envelope hint + Playwright error banner hint.

Verification steps:
1) API: `pnpm -C apps/api test:e2e -- phase5.e2e-spec.ts`
2) UI: `pnpm -C apps/web test:e2e -- phase5.spec.ts`
3) Manual: save/post an invoice or bill and confirm success toast and last-saved text updates.

Risk notes:
- Toast notifications are in-memory; refreshes will clear pending messages.

## Accounting correctness gaps tracking
- [x] Multi-currency warning shown when currency differs from org base currency
- [ ] Lock date enforcement in posting flows (API + UI)
- [ ] Void/reversal workflows for posted documents
- [ ] Exchange rate application for GL postings
- [ ] Reports assume base currency while GL stores doc currency
