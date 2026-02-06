# 30 - UX Audit User Stories (Prioritized + Detailed)

## Purpose
Translate `docs/29-ux-audit-report.md` into executable user stories with clear priority, UI/UX-first order, and explicit backend implications.

Priority key:
- **P0** = Must do first (blocking usability/safety)
- **P1** = High impact
- **P2** = Medium impact
- **P3** = Nice-to-have / can defer

---

## P0 – Safety, Clarity, and Navigation Foundations (UI/UX First)

### UX-P0-01 — Posting/void semantics clarity
**As a** business user,  
**I want** clear “what happens” guidance before posting/voiding,  
**So that** I don’t unknowingly change the books.

**Acceptance Criteria**
- Post dialogs explain ledger impact and reversibility in plain language.
- Void dialogs explain reversal entries and effect on reports.
- Lock date warnings are shown before confirm.
- Copy is consistent across invoices, bills, expenses, journals.

**Backend impact**
- None required (uses existing ledger preview data).

**Implementation tasks (order)**
1) Create shared `PostImpactSummary` component.
2) Use in invoice/bill/expense/journal post dialogs.
3) Standardize void dialog copy.

---

### UX-P0-02 — Breadcrumb navigation everywhere
**As a** user,  
**I want** breadcrumbs on every page,  
**So that** I can navigate back quickly.

**Acceptance Criteria**
- Breadcrumbs on all authenticated pages.
- Dynamic labels resolve to display numbers/names where possible.
- Mobile wraps gracefully.

**Backend impact**
- Optional: add tiny “label lookup” endpoint for entities (invoice/bill/customer) if not already exposed.

**Implementation tasks**
1) Create global breadcrumb component and route map.
2) Add data fetchers for dynamic labels (optional).
3) Wire into layout or page headers.

---

### UX-P0-03 — Consistent page header (icon + title + H1)
**As a** user,  
**I want** consistent page headers,  
**So that** the UI feels predictable.

**Acceptance Criteria**
- Each page has: small icon/section badge, title, H1 in content.
- Actions appear in a consistent area.
- Responsive layout with no overflow.

**Backend impact:** None.

**Implementation tasks**
1) Build shared `PageHeader`.
2) Apply to core modules.

---

## P1 – Long Forms, Mobile, and Core Workflow Friction

### UX-P1-01 — Modals/sheets fit viewport
**As a** user,  
**I want** long dialogs to scroll properly,  
**So that** I can reach Save/Cancel.

**Acceptance Criteria**
- No clipping on desktop/mobile.
- Sticky footer for actions (or visible at end).

**Backend impact:** None.

**Tasks**
1) Update dialog/sheet base styles.
2) Validate on items, invoices, bills, payments, settings.

---

### UX-P1-02 — Reduce information overload via sections/accordions
**As a** user,  
**I want** large forms grouped into sections,  
**So that** they’re easier to complete.

**Acceptance Criteria**
- Long forms have section headings.
- Advanced sections are collapsed by default.
- Validation errors point to the right section.

**Backend impact:** None.

**Tasks**
1) Identify long forms (org settings, item setup, bank accounts).
2) Add section grouping + advanced accordion.

---

### UX-P1-03 — Line items mobile layout
**As a** mobile user,  
**I want** line item entry to be usable on small screens,  
**So that** I can create transactions on my phone.

**Acceptance Criteria**
- No horizontal scroll for core fields at 375px.
- Add/edit/remove is touch friendly.
- Desktop keeps table; mobile uses card/stack layout.

**Backend impact:** None.

**Tasks**
1) Add responsive layout switch.
2) Build mobile line cards for invoice/bill/expense.

---

### UX-P1-04 — Bank account currency safety + opening balance help
**As a** bookkeeper,  
**I want** validated currency selection and clear opening balance guidance,  
**So that** I avoid incorrect setup.

**Acceptance Criteria**
- Currency is a dropdown (ISO).
- Base currency preselected.
- Opening balance helper text visible.

**Backend impact**
- Recommended: API validation to reject invalid currency.

**Tasks**
1) Add currency list to shared package.
2) Replace text input with dropdown.
3) Add API validation (if missing).

---

## P2 – Dashboard UX Improvements

### UX-P2-01 — Clean dashboard KPI cards
**As a** business user,  
**I want** compact cards with labels and icons,  
**So that** I can scan quickly.

**Acceptance Criteria**
- KPI cards include value, label, icon, optional trend.
- Cards are consistent in size and spacing.
- Cards link to relevant detail pages where possible.

**Backend impact**
- Optional: add trend delta or comparison metrics.

**Tasks**
1) Define KPI card UI spec.
2) Add optional trend data from API.
3) Hook cards to deep links.

---

### UX-P2-02 — Grouped dashboard layout
**As a** user,  
**I want** grouped dashboard sections,  
**So that** I can find insights quickly.

**Acceptance Criteria**
- Logical grouping (cash, sales, expenses, AR/AP).
- Responsive layout.
- No hidden critical info on mobile.

**Backend impact:** None.

**Tasks**
1) Restructure dashboard sections.
2) Ensure layout works across breakpoints.

---

## P2 – Discoverability & IA

### UX-P2-03 — Make dashboard master-data tabs visible or separate routes
**As a** user,  
**I want** clear navigation for customers/vendors/items/accounts,  
**So that** I don’t get lost in hidden tabs.

**Acceptance Criteria**
- Visible tabs within dashboard OR separate routes.
- Breadcrumbs reflect section.

**Backend impact:** None.

**Tasks**
1) Decide tab vs route.
2) Update nav links and route structure.
3) Add breadcrumbs.

---

## P3 – Workflow Assistance (Nice-to-have, but valuable)

### UX-P3-01 — Auto-allocate payments
**As a** bookkeeper,  
**I want** payments auto-applied by default,  
**So that** I can post faster.

**Acceptance Criteria**
- “Auto-apply remaining” option exists.
- Oldest open items selected by default.
- Manual allocation still possible.

**Backend impact**
- Recommended: allocation helper to ensure consistent rounding and policy.

**Tasks**
1) Add backend allocation helper.
2) Add UI button + preview.

---

### UX-P3-02 — Reconciliation matching suggestions
**As a** bookkeeper,  
**I want** match suggestions and search,  
**So that** reconciliation is faster.

**Acceptance Criteria**
- Search by amount/date/memo.
- Suggested matches ordered by closeness.
- Partial match amount allowed (if supported).

**Backend impact**
- Suggested: matching heuristic endpoint.

**Tasks**
1) Add suggestion endpoint.
2) Add UI search + suggestion list.

---

### UX-P3-03 — Credit notes UI visibility
**As a** bookkeeper,  
**I want** credit notes accessible from invoices and nav,  
**So that** I can issue adjustments.

**Acceptance Criteria**
- Credit notes list/detail screens exist.
- “Create credit note” action on invoices.

**Backend impact**
- Confirm/extend API list endpoints if needed.

**Tasks**
1) Build list/detail UI.
2) Add invoice action.

---

## Dependencies & Notes
- Breadcrumbs (P0) should be done before split routes (P2) to avoid rework.
- Mobile line items (P1) should be done after dialog/sheet fixes to reuse scrolling patterns.
- Auto-allocation/reconciliation suggestions (P3) likely need backend endpoints; schedule after core UX fixes.

