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

## Phase 2 - Inline validation and errors (planned)
Changes:
- Journal line validation with live balancing and disabled Post.
- Inline totals and per-field hints for invoices, bills, payments, vendor payments.
- ErrorBanner component with normalized messaging.

Verification steps:
- TODO

Risk notes:
- TODO

## Phase 3 - Filters and saved views (planned)
Changes:
- Reusable FilterRow with URL persistence.
- Saved views model + API + UI.

Verification steps:
- TODO

Risk notes:
- TODO

## Phase 4 - Sidebar navigation and badges (planned)
Changes:
- Grouped sidebar with icons and optional draft count badges.

Verification steps:
- TODO

Risk notes:
- TODO

## Phase 5 - Feedback, last saved, API errors (planned)
Changes:
- Toasts for save/post/void/import/reconcile actions.
- "Last saved" and "Posted at" timestamps on detail pages.
- Global API error normalization filter.

Verification steps:
- TODO

Risk notes:
- TODO

## Accounting correctness gaps tracking
- [x] Multi-currency warning shown when currency differs from org base currency
- [ ] Lock date enforcement in posting flows (API + UI)
- [ ] Void/reversal workflows for posted documents
- [ ] Exchange rate application for GL postings
- [ ] Reports assume base currency while GL stores doc currency
