# 26 - Pending Sprint User Stories

## Purpose

Keep a status-sorted snapshot of sprint-planning user stories that are not completed yet (or intentionally de-scoped).

Last updated: 2026-02-05

Source story documents:
- `docs/18-release-identification-and-public-ux-user-stories.md`
- `docs/20-inventory-and-ops-usability-user-stories.md`
- `docs/22-auth-onboarding-monitoring-admin-user-stories.md`
- `docs/27-accounting-correctness-hardening-user-stories.md`

Additional backlog (added directly here, not yet reflected in a dedicated source doc):
- Cross-app breadcrumbs, page headers, modal/sheet UX, mobile usability, and dev-only master-data seeding

Audit-driven patch plan:
- `docs/28-accounting-correctness-hardening-patch-plan.md`

---

## Inventory and Operations Usability (Doc 20)

---

## Accounting Correctness Hardening (Doc 27)

This set is audit-driven and grouped by severity and phase. Detailed task breakdown and patch order are in:
- `docs/27-accounting-correctness-hardening-user-stories.md`
- `docs/28-accounting-correctness-hardening-patch-plan.md`

## Epic 1: Item Setup and Inventory Defaults

### User Story 1.1 - Auto-generate SKU when creating items

As a user creating an item,
I want SKU to auto-generate when left blank,
So that I can save items faster without manual code typing.

#### Acceptance Criteria

- When SKU is blank, system generates SKU automatically.
- Generated SKU is unique per organization.
- User can still manually override SKU before save.
- SKU format is consistent and sortable (example: `ITM-000123`).

### User Story 1.2 - Reorder point follows selected unit of measure

As an inventory user,
I want reorder point to be entered in the unit I selected,
So that thresholds match how I operate the item.

#### Acceptance Criteria

- Reorder point input label clearly shows active UOM.
- System stores normalized value in base unit internally.
- UI shows reorder point back in selected/display unit.
- Conversion rules follow the item UOM conversion map.

### User Story 1.3 - Opening quantity uses selected unit and opening value can auto-calculate

As a user creating opening stock,
I want opening quantity to align with selected UOM and opening value to be calculated when possible,
So that setup is faster and less error-prone.

#### Acceptance Criteria

- Opening quantity is captured in selected UOM.
- Quantity is normalized to base unit for storage.
- If quantity and unit cost are provided, opening value auto-calculates.
- If quantity and opening value are provided, unit cost auto-calculates.
- User can manually override computed value before save.

## Epic 2: Transaction Entry Usability

### User Story 2.2 - Expense paid-from account options are practical

As a user recording expenses,
I want the paid-from dropdown to include all valid payment accounts,
So that I can post from bank, cash, or other allowed payment accounts.

#### Acceptance Criteria

- Paid-from includes allowed payment account types (not only operating bank).
- Default selection can remain operating bank if present.
- Inactive/blocked accounts are excluded.

### User Story 2.3 - Journal entry mode for non-accountants

As a common business user,
I want journal entry labels that are easier than debit/credit jargon,
So that I can enter basic adjustments confidently.

#### Acceptance Criteria

- Journal UI has a user-friendly mode with plain-language labels.
- Debit/Credit terminology remains available in advanced/accountant mode.
- Helper hints explain effect based on selected account type.
- Validation still enforces balanced entries.

---

## Monitoring, Swagger, Platform Admin, and Dashboard UX (Doc 22)

## Epic 6: Monitoring, Observability, and Infrastructure Visibility

### User Story 6.1 - Environment-separated monitoring stack

As a platform engineer,
I want separate monitoring scope for `DEV`, `STAGE`, and `PROD`,
So that data and incidents do not mix across environments.

#### Acceptance Criteria

- Distinct environment dashboards and alert policies.
- Separate domains/subdomains per environment.
- Access restricted by auth and/or network policy.

### User Story 6.2 - Metrics and dashboard visibility

As a platform engineer,
I want API, infra, and DB health metrics visible in dashboards,
So that latency and failure trends are quickly detectable.

#### Acceptance Criteria

- Metrics include:
  - request rate,
  - p95/p99 latency,
  - 4xx/5xx rates,
  - host CPU/memory/disk,
  - DB health status.
- Alert rules exist for:
  - high error rate,
  - service down,
  - sustained latency spike,
  - low disk threshold.

### User Story 6.3 - Centralized structured logging

As a support engineer,
I want searchable logs by environment and request context,
So that incidents can be traced quickly.

#### Acceptance Criteria

- Logs shipped to centralized backend by environment.
- Required log fields include:
  - `environment`,
  - `service`,
  - `requestId`,
  - safe org/user references when permitted.
- Log search supports time range + service + requestId filters.

### User Story 6.4 - Distributed tracing for bottleneck analysis

As a developer,
I want cross-service traces,
So that slow paths are diagnosable.

#### Acceptance Criteria

- OpenTelemetry instrumentation is enabled for API flow.
- Traces are queryable in tracing backend.
- Grafana correlation supports metrics/logs/traces pivot by request id.

### User Story 6.5 - Error tracking and APM

As an engineer,
I want error events and release-linked performance data,
So that production issues can be resolved faster.

#### Acceptance Criteria

- Runtime exceptions captured with stack/context.
- Error alerts fire on spike thresholds.
- Release/version tags align with app release footer metadata.

### User Story 6.6 - Uptime checks for key endpoints

As a platform engineer,
I want synthetic uptime checks across critical endpoints,
So that outages are detected quickly.

#### Acceptance Criteria

- Checks include:
  - web root,
  - API health endpoint,
  - auth endpoint,
  - swagger endpoint.
- Alerting on downtime and high response time.

### User Story 6.7 - Observability performance guardrails

As a platform engineer,
I want telemetry configuration caps,
So that monitoring overhead stays low and predictable.

#### Acceptance Criteria

- Production defaults:
  - tracing sampled (1-5%),
  - logs at `WARN/ERROR`,
  - metrics scrape interval 15-30s.
- Dev/stage can use higher verbosity.
- Monitoring configuration docs include cardinality and retention limits.

## Epic 7: API Documentation via Swagger

### User Story 7.1 - Auto-generated Swagger documentation

As a developer/integrator,
I want Swagger docs for all core APIs,
So that integration is faster and less error-prone.

#### Acceptance Criteria

- Swagger UI available per environment.
- Docs include auth, org, accounting, and system endpoints.
- Request/response schemas are visible and accurate.
- Auth flow documentation includes bearer token usage and required headers.

## Epic 8: LedgerLite Product Manager (Super Admin) Role

### User Story 8.1 - Global org visibility for Product Manager

As a LedgerLite Product Manager,
I want to view all organizations,
So that I can monitor tenant health and support needs.

#### Acceptance Criteria

- Role `LEDGERLITE_PRODUCT_MANAGER` can list all orgs.
- List includes:
  - org status,
  - user count,
  - setup/compliance state.

### User Story 8.2 - Platform-level org controls

As a Product Manager,
I want to activate/deactivate and reset org controls,
So that support and policy actions can be executed centrally.

#### Acceptance Criteria

- Allowed controls:
  - activate/deactivate org,
  - reset selected org settings,
  - lock/unlock org account.
- All actions are audited with actor + timestamp + reason.

### User Story 8.3 - Time-bound impersonation for support

As a Product Manager,
I want temporary impersonation access,
So that I can troubleshoot user-reported issues directly.

#### Acceptance Criteria

- Impersonation is visibly indicated in UI.
- Session is time-bound and auto-expires.
- Full audit trail for start/stop and actions taken.
- Password/credential management actions are blocked while impersonating.

## Epic 9: Dashboard UX Enhancements

### User Story 9.1 - Clean, informative dashboard cards

As a business user,
I want compact KPI cards with clear labels,
So that I can assess status quickly.

#### Acceptance Criteria

- Cards include:
  - key value,
  - label,
  - icon,
  - optional trend/context.
- Cards are consistent in size and spacing.
- Cards are clickable when deep links exist.

### User Story 9.2 - Better dashboard layout and readability

As a user,
I want a clean grouped dashboard layout,
So that I can navigate insights without clutter.

#### Acceptance Criteria

- Logical section grouping.
- Consistent spacing rhythm and typography.
- Responsive behavior for desktop/tablet/mobile.
- No critical information is hidden on mobile.

---

## Cross-App UX and Mobile Usability (New)

## Epic 1: Navigation and Page Structure

### User Story 1.1 - Breadcrumb navigation on every page

As a user,
I want breadcrumbs on each page,
So that I can understand where I am and navigate back quickly.

#### Acceptance Criteria

- Breadcrumbs are visible on all authenticated app pages.
- Breadcrumb path reflects the current route hierarchy (example: `Dashboard > Invoices > INV-000123`).
- Each breadcrumb segment is clickable and navigates to the correct page.
- Current page segment is not clickable and is visually distinct.
- Breadcrumbs handle dynamic routes with human-readable labels when possible (IDs -> display names).
- Breadcrumbs remain usable on mobile (wraps or collapses gracefully).

### User Story 1.2 - Consistent page header (logo + title + heading)

As a user,
I want a consistent page header layout,
So that every page looks familiar and the primary action context is clear.

#### Acceptance Criteria

- Every authenticated page has a top header that includes:
  - a small logo (or section icon),
  - a page title,
  - an `H1` heading within the page content.
- Header layout is consistent across pages (spacing, typography, alignment).
- Header is responsive and does not overflow on small screens.

## Epic 2: Popups, Side Panels, and Large Forms

### User Story 2.1 - Modals and side panels always fit the viewport

As a user,
I want dialogs and side panels to be usable even with many fields,
So that I can complete forms without losing buttons or content off-screen.

#### Acceptance Criteria

- No modal/sheet content is clipped off-screen on common viewport sizes (desktop and mobile).
- Long forms inside modals/sheets scroll within the container (not behind the footer/actions).
- Primary actions (Save/Cancel) remain reachable (sticky footer or visible at end of scroll).
- For mobile, large forms use a full-screen modal/sheet pattern where needed.
- Key screens with known issues are identified and fixed (with before/after screenshots in PR).

### User Story 2.2 - Reduce information overload via sections/accordions

As a user,
I want long forms to be grouped into clear sections,
So that screens remain understandable and faster to complete.

#### Acceptance Criteria

- Pages with many inputs are reorganized into sections with headings.
- Optional/advanced fields are collapsed by default (accordion or "Advanced" section).
- Users can expand/collapse sections without losing entered data.
- Validation errors clearly indicate which section contains the issue.

## Epic 3: Mobile Usability Improvements

### User Story 3.1 - Line item entry is mobile friendly

As a mobile user,
I want line item entry to work well on small screens,
So that I can create/edit transactions from my phone.

#### Acceptance Criteria

- Line item UI is usable at <= 375px width:
  - no horizontal scrolling required for core fields,
  - add/edit/remove line items is straightforward,
  - item search/selection is usable on touch devices.
- If a table layout is used on desktop, mobile uses a stacked/card layout or an edit screen.
- Keyboard and touch interactions work reliably (focus, dropdowns, scroll).

### User Story 3.2 - App-wide mobile responsiveness audit and fixes

As a user,
I want key app pages to be usable on mobile,
So that the application works for on-the-go workflows.

#### Acceptance Criteria

- Identify top user flows/pages and verify usability on mobile:
  - dashboard,
  - sales (invoices),
  - purchases (bills/expenses),
  - inventory (items),
  - settings (organization, users).
- Fix layout overflow, cramped spacing, and unreadable typography issues.
- Side panels/modals follow the responsive rules from Epic 2.

## Epic 4: Dev-only Seed Data (Master Data Only)

### User Story 4.1 - Pre-seed master data in DEV only (no transactions)

As a developer/tester,
I want DEV to have pre-seeded master data (but no transactions),
So that I can test flows quickly without polluting data with fake invoices/bills.

#### Acceptance Criteria

- Only DEV environment performs master-data seeding (not staging/prod).
- Seed includes static/master data only (examples):
  - chart of accounts defaults,
  - tax codes,
  - units of measurement,
  - default organization settings,
  - roles/permissions templates where applicable.
- Seed does NOT create transactions (invoices, bills, payments, journal entries).
- Seeding is idempotent and safe to run multiple times.
- Seeding can be toggled or triggered intentionally (document the mechanism).

---

## De-scoped (No Longer Planned as Hard Gates)

These user stories existed in the original plan, but the product direction changed:
we do not hard-block users from using the app when org details are incomplete, and we do not enforce an onboarding checklist.

### User Story 4.2 - Enforced org setup after verification (De-scoped)

We still support completing organization settings, but it is optional and non-blocking (see Doc 20, Epic 3).

### User Story 4.3 - Automatic redirect when setup is incomplete (De-scoped)

We do not redirect/block users from dashboard/modules due to incomplete organization setup.

### Role-based onboarding checklist (De-scoped)

The checklist definition exists in `docs/14-onboarding-checklist-definition.md`, but the checklist is not required and is not enforced.

---

## UX Audit Follow-up (Doc 29) - Phase-by-Phase Delivery Plan

This plan turns the UX audit findings into phased, implementable user stories. Each story includes backend impact notes (if any) and task order.

### Phase 1: Navigation, Structure, and Safety Clarity (Foundational UX)

#### User Story 1.1 - Breadcrumb navigation on every page (Included)
- **Backend impact:** None required. Use existing page data for dynamic labels (invoice number, bill number, etc.). If not available, add lightweight API fetch per page (optional).
- **Tasks (order):**
  1) Add shared breadcrumb component in `apps/web/src/lib` with responsive wrapping.
  2) Add breadcrumb config map for static routes (Dashboard, Invoices, Bills, Reports, Settings).
  3) Add dynamic label resolvers for routes with IDs (invoice, bill, payment, journal, reconciliation).
  4) Wire breadcrumbs into all authenticated pages via a layout wrapper or page header component.

#### User Story 1.2 - Consistent page header (logo + title + heading) (Included)
- **Backend impact:** None.
- **Tasks (order):**
  1) Create a shared `PageHeader` component with icon + title + optional actions.
  2) Replace existing page headers in primary modules (dashboard, invoices, bills, payments, settings).
  3) Ensure heading and breadcrumbs do not overflow on mobile.

#### User Story UX-101 - Clear posting/void semantics with impact summary (New)
As a business user,  
I want clear explanations before posting or voiding,  
So that I understand how it affects my books.

**Acceptance Criteria**
- Post dialog shows a short “what happens” summary (ledger impact + reversibility).
- Void dialog explains that a reversal entry will be created.
- Warnings for locked periods are visible before confirmation.

**Backend impact:** None required. Uses existing post preview data.
**Tasks (order):**
1) Add “What happens” section to post/void dialogs for invoices, bills, expenses, journals.
2) Reuse ledger preview data where available.
3) Add consistent copy + warnings (lock date, negative stock).

#### User Story UX-102 - Permission blocks explain next steps (New)
As a staff user,  
I want to know why an action is blocked and what to do next,  
So that I can complete my task without guessing.

**Acceptance Criteria**
- Permission errors include the missing permission and “Ask admin” guidance.
- Blocked pages link to an admin contact path.

**Backend impact:** None.
**Tasks (order):**
1) Standardize permission error component.
2) Update all guarded routes to use it.

---

### Phase 2: Modals, Sheets, and Long Forms (Usability & Overload)

#### User Story 2.1 - Modals and side panels always fit the viewport (Included)
- **Backend impact:** None.
- **Tasks (order):**
  1) Update base dialog/sheet styles to allow internal scrolling.
  2) Add sticky footer action area for long forms.
  3) Validate on key screens: items, invoices, bills, payments, org settings.

#### User Story 2.2 - Reduce information overload via sections/accordions (Included)
- **Backend impact:** None.
- **Tasks (order):**
  1) Identify “long form” screens (org settings, item setup, bank account).
  2) Group fields into sections: Basics, Taxes/VAT, Numbering, Accounting Controls.
  3) Add advanced sections collapsed by default.
  4) Ensure validation errors highlight the correct section.

#### User Story UX-201 - Safer bank account setup (currency + opening balance guidance) (New)
As a bookkeeper,  
I want bank account currency to be validated and opening balance explained,  
So that I don’t create incorrect postings.

**Acceptance Criteria**
- Currency is a dropdown (valid ISO codes) with org base currency default.
- Opening balance field shows short helper text (affects GL opening).

**Backend impact:** Optional validation in API to enforce valid currency codes.
**Tasks (order):**
1) Add shared currency list in `@ledgerlite/shared`.
2) Replace free-text input with dropdown.
3) Add API validation (reject invalid currency).

---

### Phase 3: Mobile Usability (Transactions & Core Flows)

#### User Story 3.1 - Line item entry is mobile friendly (Included)
- **Backend impact:** None.
- **Tasks (order):**
  1) Implement mobile “line card” layout for invoice/bill/expense lines.
  2) Add touch-friendly add/edit/remove controls.
  3) Ensure totals and tax summary remain visible.

#### User Story 3.2 - App-wide mobile responsiveness audit and fixes (Included)
- **Backend impact:** None.
- **Tasks (order):**
  1) Define mobile breakpoints and spacing rules.
  2) Audit key pages: dashboard, invoices, bills, expenses, items, settings.
  3) Fix overflow and cramped spacing.

---

### Phase 4: Dashboard UX Enhancements (Clarity & Readability)

#### User Story 9.1 - Clean, informative dashboard cards (Included)
- **Backend impact:** Optional if trends/comparisons are added.
- **Tasks (order):**
  1) Define KPI card structure (value, label, icon, trend).
  2) Update dashboard summary API (optional) to include trend deltas.
  3) Make cards clickable where deep links exist.

#### User Story 9.2 - Better dashboard layout and readability (Included)
- **Backend impact:** None.
- **Tasks (order):**
  1) Group dashboard sections logically (cash, sales, expenses, AR/AP).
  2) Apply consistent spacing + typography.
  3) Ensure layout works across breakpoints.

#### User Story UX-401 - Make dashboard sections discoverable (New)
As a user,  
I want master data (customers/vendors/items/accounts) to be easy to find,  
So that I don’t get lost in the dashboard tabs.

**Acceptance Criteria**
- Dashboard tabs are visible or replaced with dedicated routes.
- Breadcrumbs reflect the section.

**Backend impact:** None.
**Tasks (order):**
1) Decide: visible tabs vs separate routes.
2) Update navigation links and routing.
3) Add breadcrumbs on these sections.

---

### Phase 5: Workflow Assistance (High-impact UX improvements)

#### User Story UX-501 - Auto-allocate payments (New)
As a bookkeeper,  
I want payments to auto-apply to open invoices/bills by default,  
So that I can post faster and avoid allocation errors.

**Acceptance Criteria**
- “Auto-apply remaining” option exists.
- Default allocation uses oldest open items.
- User can switch to manual allocation.

**Backend impact:** Recommended: add allocation helper service/endpoint to ensure consistent business rules and rounding.
**Tasks (order):**
1) Add backend allocation helper (oldest-first).
2) Expose endpoint or embed in existing post flows.
3) Add UI button + preview of allocation.

#### User Story UX-502 - Reconciliation matching assistance (New)
As a bookkeeper,  
I want match suggestions and search filters,  
So that reconciliation is faster and more accurate.

**Acceptance Criteria**
- Search by amount/date/memo.
- Suggested matches ranked by closeness.
- Support partial match amount input.

**Backend impact:** Suggested: add matching suggestion API using amount/date heuristics.
**Tasks (order):**
1) Add backend suggestion logic.
2) Add UI search and suggestion list.
3) Add partial match workflow (if supported).

#### User Story UX-503 - Credit note workflow visibility (New)
As a bookkeeper,  
I want credit notes accessible from invoices and navigation,  
So that I can issue refunds/adjustments easily.

**Acceptance Criteria**
- Credit notes list + detail screens exist.
- “Create credit note” action appears on invoice detail.

**Backend impact:** API already exists; confirm list endpoints or add if missing.
**Tasks (order):**
1) Build list/detail UI.
2) Add action from invoice page.
3) Validate permissions and post/void flows.
