# LedgerLite Phase 6-9 Audit

## 1) UI App Shell + Navigation
- Protected layout defined at `apps/web/app/(protected)/layout.tsx` (components: `ProtectedLayout`, `ProtectedLayoutInner`).
- Sidebar component path: Not found (sidebar markup is inline in `apps/web/app/(protected)/layout.tsx`).
- Topbar path: `apps/web/app/(protected)/layout.tsx` (`<header className="topbar">`).
- Nav items are configured as a static `navGroups` array in `apps/web/app/(protected)/layout.tsx` (in-code `NavGroup`/`NavItem` definitions with permission gates).
- Page titles are handled per-page via `<h1>` in each route component; breadcrumbs: Not found.
- Where to add grouped sidebar (Sales/Purchases/Banking/Reports/Settings): update the `navGroups` array in `apps/web/app/(protected)/layout.tsx` (already grouped in current file).

## 2) Auth + Invite Flow
- Current web auth routes and files:
  - `/login` -> `apps/web/app/login/page.tsx` (login + invite acceptance in same page)
  - `/logout` -> Not found (no Next.js route)
  - `/` -> `apps/web/app/page.tsx` (links to `/login`)
- API auth routes and files:
  - `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me` -> `apps/api/src/auth/auth.controller.ts`
- Invite acceptance currently happens on `/login` in `apps/web/app/login/page.tsx` (second card posts to `/orgs/users/invite/accept`).
- Auth token storage pattern on web:
  - Access token: in-memory variable in `apps/web/src/lib/auth.ts` (no localStorage/sessionStorage)
  - Refresh token: httpOnly cookie set by `apps/api/src/auth/auth.controller.ts` (`/auth/login` and `/auth/refresh`)
- Invite API endpoints (controller/service + payloads):
  - `POST /orgs/users/invite` -> `apps/api/src/modules/org-users/org-users.controller.ts` + `apps/api/src/modules/org-users/org-users.service.ts`
    - Payload: `InviteCreateInput` from `packages/shared/src/schemas/invites.ts` (email, roleId, expiresInDays?)
  - `POST /orgs/users/invite/accept` -> same controller/service
    - Payload: `InviteAcceptInput` from `packages/shared/src/schemas/invites.ts` (token, password)
- Recommended new route structure:
  - `/invite?token=...` -> new page `apps/web/app/invite/page.tsx`
  - `/login` -> sign-in only (remove invite form)

## 3) Toasts + Feedback + Error Handling
- Toast library/provider:
  - Radix Toast wrapper: `apps/web/src/lib/ui-toast.tsx`
  - Toast store hook: `apps/web/src/lib/use-toast.ts`
  - Toaster renderer: `apps/web/src/lib/ui-toaster.tsx`
  - Provider mounted at `apps/web/app/layout.tsx`
- Current action points and feedback:
  - Save/post: `apps/web/app/(protected)/invoices/[id]/page.tsx`, `bills/[id]/page.tsx`, `payments-received/[id]/page.tsx`, `vendor-payments/[id]/page.tsx`, `journals/[id]/page.tsx`
  - Import: `apps/web/app/(protected)/bank-transactions/import/page.tsx`
  - Reconcile: `apps/web/app/(protected)/reconciliation/page.tsx` (create session), `apps/web/app/(protected)/reconciliation/[id]/page.tsx` (match/close)
- API error shape:
  - `apps/api/src/common/http-exception.filter.ts` returns `ApiError` from `packages/shared/src/api.ts`
  - Shape: `{ ok: false, error: { code, message, details?, hint? }, requestId }`
- Client fetch helpers:
  - `apps/web/src/lib/api.ts` (`apiFetch`, `ensureAccessToken`, `refreshAccessToken`)
  - Direct fetch in `apps/web/src/features/auth/use-permissions.tsx` for `/auth/me`

## 4) Forms + Validation + Inline Totals
- Form library: `react-hook-form` with `zodResolver` (`apps/web/src/lib/zod-resolver`), schemas from `packages/shared/src/schemas/*`.
- Invoices (`apps/web/app/(protected)/invoices/[id]/page.tsx`)
  - Totals: client-side `lineCalculations` + `computedTotals` using `apps/web/src/lib/money.ts` helpers
  - Validation: `invoiceCreateSchema` + inline `renderFieldError`
  - Inline totals already in the totals header and per-line table cells
- Bills (`apps/web/app/(protected)/bills/[id]/page.tsx`)
  - Totals: client-side `lineCalculations` + `computedTotals`
  - Validation: `billCreateSchema` + inline field errors
  - Inline totals in totals header and per-line cells
- Payments received (`apps/web/app/(protected)/payments-received/[id]/page.tsx`)
  - Totals: client-side allocations sum via `toCents`, outstanding via `computeOutstanding`
  - Validation: `paymentReceivedCreateSchema` + inline errors + over-allocation checks
  - Inline totals in allocations header and per-row warnings
- Vendor payments (`apps/web/app/(protected)/vendor-payments/[id]/page.tsx`)
  - Totals: client-side allocations sum via `toCents`, outstanding via `computeOutstanding`
  - Validation: `vendorPaymentCreateSchema` + inline errors + over-allocation checks
- Journals (`apps/web/app/(protected)/journals/[id]/page.tsx`)
  - Totals: client-side `totals` via `toCents`
  - Validation: `journalCreateSchema` + `lineIssues` debit/credit rules
  - Inline totals in header with balanced/unbalanced chip
- Where to add more inline hints/live totals: use existing `section-header` totals blocks and line-table cells in the same pages.

## 5) Item Selector Typeahead (Phase 6)
- Invoice line item selector: `apps/web/app/(protected)/invoices/[id]/page.tsx` (Radix `Select` for `itemId`).
- Bill line item selector: `apps/web/app/(protected)/bills/[id]/page.tsx`.
- Items loading: `apiFetch("/items")` on page load, no pagination, no search.
- API search support: `GET /items?search=...&isActive=...` in `apps/api/src/modules/items/items.controller.ts` and `apps/api/src/modules/items/items.service.ts`.
- Indexes: `Item` has `@@index([orgId, name])` in `apps/api/prisma/schema.prisma`; no index for `sku`.
- Recommended implementation:
  - Add `ui-combobox` (`apps/web/src/lib/ui-combobox.tsx`) or `ui-item-combobox` with Radix Popover + searchable list.
  - Debounce search and call `/items?search=...&isActive=true`.
  - Add `@@index([orgId, sku])` and optional pagination for large catalogs.

## 6) Dashboard Home (Phase 6)
- `/dashboard` exists and is a settings hub, not a KPI home:
  - Route: `apps/web/app/(protected)/dashboard/page.tsx`
  - Component: `apps/web/src/features/dashboard/dashboard-page.tsx`
- Landing route after login: `/dashboard` (see `apps/web/app/login/page.tsx`).
- Existing KPI endpoints: Not found (no `/dashboard/*` API).
- Existing data sources:
  - Bank accounts: `GET /bank-accounts` (`apps/api/src/modules/bank-accounts`)
  - Reports: `GET /reports/trial-balance`, `/reports/profit-loss`, `/reports/balance-sheet`, `/reports/ar-aging`, `/reports/ap-aging` (`apps/api/src/modules/reports/reports.controller.ts`)
- Proposed minimal dashboard API:
  - `GET /dashboard/summary?range=...`
  - Suggested response fields:
    - `bankBalances[]`: per bank account balance (GL + opening balance)
    - `cashBalance`: sum of BANK/CASH accounts
    - `arOutstanding`: sum of posted invoice totals minus amountPaid
    - `apOutstanding`: sum of posted bill totals minus amountPaid
    - `salesTotal`, `expenseTotal`, `netProfit`: from GL lines by account type within range
- UI components to reuse:
  - `card` CSS class from `apps/web/app/globals.css`
  - `Button` in `apps/web/src/lib/ui-button`
  - `Table` in `apps/web/src/lib/ui-table`
  - `StatusChip` in `apps/web/src/lib/ui-status-chip`

## 7) Lock Date Enforcement (Phase 7)
- `OrgSettings.lockDate` is defined in `apps/api/prisma/schema.prisma`.
- Usage in API/UI: Not found.
- Posting entry points (inject enforcement):
  - `apps/api/src/modules/invoices/invoices.service.ts` `postInvoice`, `updateInvoice`
  - `apps/api/src/modules/bills/bills.service.ts` `postBill`, `updateBill`
  - `apps/api/src/modules/payments-received/payments-received.service.ts` `postPayment`, `updatePayment`
  - `apps/api/src/modules/vendor-payments/vendor-payments.service.ts` `postPayment`, `updatePayment`
  - `apps/api/src/modules/journals/journals.service.ts` `postJournal`, `updateJournal`
- Date fields to compare:
  - Invoice: `invoiceDate`
  - Bill: `billDate`
  - Payments received: `paymentDate`
  - Vendor payments: `paymentDate`
  - Journal: `journalDate`
- Proposed helper: `ensureNotLocked(lockDate, docDate, action)` in `apps/api/src/common/lock-date.ts`.
- UI warning locations: post confirmation dialogs and header banners in each document detail page.

## 8) Void/Reversal Readiness (Phase 8)
- Schema support:
  - `DocumentStatus` includes `VOID` (`apps/api/prisma/schema.prisma`)
  - `GLStatus` includes `REVERSED` and `VOID`
  - `GLHeader.reversedByHeaderId` exists
  - `AuditAction` includes `VOID`
- Gaps:
  - Void endpoints: Not found (no `POST /invoices/:id/void`, `POST /bills/:id/void`, etc).
  - Reversal helper: Not found (no shared GL reversal builder).
  - UI void actions: Not found (no void button/menu on detail pages).
- Recommended additions:
  - API endpoints per document type with reversal GLHeader and balanced GLLine entries.
  - Shared helper to reverse lines (swap debit/credit) and link `reversedByHeaderId`.
  - UI void action in detail pages with confirmation dialog and status change to VOID.

## 9) Testing Infra (Playwright + API e2e)
- Playwright setup:
  - Config: `apps/web/playwright.config.ts`
  - Tests: `apps/web/tests/*.spec.ts`
  - Global setup: `apps/web/tests/global-setup.ts` (seeds DB)
- API e2e pattern:
  - Jest config: `apps/api/jest.config.js`
  - Tests: `apps/api/test/*.e2e-spec.ts` using `supertest`, `Test.createTestingModule`, `requestContextMiddleware`.
- Recommended Phase 6-8 tests:
  - Invite flow on `/invite` page (UI)
  - Toast on save/post/import/reconcile (UI)
  - Item typeahead selection (UI)
  - Dashboard render and data (UI + API)
  - Lock date blocks posting (API + UI)
  - Void creates reversal and locks doc (API + UI)

## 10) Quick Wins List (UI/Design)
1. Standard page header component in `apps/web/src/lib/ui-page-header.tsx` and use in detail pages.
2. Breadcrumbs + org switcher in `apps/web/app/(protected)/layout.tsx` with `apps/web/src/lib/ui-breadcrumbs.tsx`.
3. Empty state cards in list pages: `apps/web/app/(protected)/invoices/page.tsx`, `bills/page.tsx`, `payments-received/page.tsx`.
4. Table density toggle in `apps/web/src/lib/ui-table.tsx` and list pages.
5. Sticky totals/action footer in `apps/web/app/(protected)/invoices/[id]/page.tsx` and `bills/[id]/page.tsx`.
6. Inline help text component in `apps/web/src/lib/ui-help-text.tsx` for tax/exchange/allocations fields.
7. Consistent skeleton loaders in `apps/web/src/lib/ui-skeleton.tsx` and list/detail pages.
8. Status chip tooltip in `apps/web/src/lib/ui-status-chip.tsx`.
9. Action menu (kebab) component in `apps/web/src/lib/ui-action-menu.tsx` for post/void actions.
10. Searchable item combobox in `apps/web/src/lib/ui-item-combobox.tsx` and use in invoices/bills.
11. Collapsible form sections in `apps/web/app/(protected)/invoices/[id]/page.tsx` and `bills/[id]/page.tsx`.
12. Keyboard shortcut for filter focus in `apps/web/src/features/filters/filter-row.tsx`.
13. Allocation over/under highlight refinements in `apps/web/app/(protected)/payments-received/[id]/page.tsx` and `vendor-payments/[id]/page.tsx`.
14. Last-saved mini status on list rows in `apps/web/app/(protected)/invoices/page.tsx` and `bills/page.tsx`.
15. Pagination component `apps/web/src/lib/ui-pagination.tsx` + list endpoint params.

---

Phase 6 Implementation Notes
- Files to change:
  - `apps/web/app/login/page.tsx` (remove invite form)
  - `apps/web/app/invite/page.tsx` (new invite page)
  - `apps/web/app/(protected)/invoices/[id]/page.tsx` and `apps/web/app/(protected)/bills/[id]/page.tsx` (searchable item selector)
  - `apps/web/app/(protected)/dashboard/page.tsx` + `apps/web/src/features/dashboard/*`
- New components to create:
  - `apps/web/src/lib/ui-combobox.tsx` or `apps/web/src/lib/ui-item-combobox.tsx`
  - `apps/web/src/lib/ui-kpi-card.tsx`
- Endpoints to add:
  - `GET /dashboard/summary?range=...` in new `apps/api/src/modules/dashboard` module
- Tests to add:
  - Playwright: `/invite` flow, item typeahead selection, dashboard summary render

Phase 7 Implementation Notes
- Files to change:
  - `apps/api/src/modules/invoices/invoices.service.ts`
  - `apps/api/src/modules/bills/bills.service.ts`
  - `apps/api/src/modules/payments-received/payments-received.service.ts`
  - `apps/api/src/modules/vendor-payments/vendor-payments.service.ts`
  - `apps/api/src/modules/journals/journals.service.ts`
  - UI warning areas in each document detail page
- New helpers/components:
  - `apps/api/src/common/lock-date.ts`
  - `apps/web/src/lib/ui-lock-warning.tsx`
- Endpoints to add:
  - Not required (enforce in existing endpoints)
- Tests to add:
  - API e2e for lock-date blocked posting
  - UI e2e for lock-date warning in post dialogs

Phase 8 Implementation Notes
- Files to change:
  - Add void endpoints in `apps/api/src/modules/*/*.controller.ts`
  - Reversal logic in `apps/api/src/common/gl-reversal.ts` + service updates
  - UI void actions in detail pages:
    - `apps/web/app/(protected)/invoices/[id]/page.tsx`
    - `apps/web/app/(protected)/bills/[id]/page.tsx`
    - `apps/web/app/(protected)/payments-received/[id]/page.tsx`
    - `apps/web/app/(protected)/vendor-payments/[id]/page.tsx`
    - `apps/web/app/(protected)/journals/[id]/page.tsx`
- New components to create:
  - `apps/web/src/lib/ui-confirm-dialog.tsx`
- Endpoints to add:
  - `POST /invoices/:id/void`, `POST /bills/:id/void`, `POST /payments-received/:id/void`,
    `POST /vendor-payments/:id/void`, `POST /journals/:id/void`
- Tests to add:
  - API e2e for reversal entries and idempotent void
  - UI e2e for void action and read-only enforcement
