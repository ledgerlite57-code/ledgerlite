# 29 - UX Audit Report (Static Code Review)

## Scope & Method (No Runtime Walkthrough)
- Reviewed routes and components under `apps/web/app` and `apps/web/src/features` to simulate user journeys from code structure, UI copy, and form layouts.
- Mapped flows from page components, dialogs, and form wiring (no live UI walkthrough).
- Used tests only as supplemental signals, not as a source of truth for UX behavior.

## 1) Executive UX Summary
### Top 10 UX Problems (Ranked by Impact)
1) **Posting vs draft/void semantics are unclear** — non-accountants can post or void without understanding financial impact.  
   Personas: First-time owner, Bookkeeper. Workflows: Invoices, Bills, Expenses, Journals.
2) **No guided onboarding / “first invoice” path** — setup is separated and long, with no clear next steps.  
   Personas: First-time owner. Workflows: Signup → Org setup → First invoice.
3) **Critical workflows hidden behind `/dashboard?tab=`** — navigation is non-obvious, no breadcrumbs.  
   Personas: All. Workflows: Customers/Vendors/Items/Accounts discovery.
4) **Payment allocations require manual entry** — no auto-apply; high risk of incorrect outstanding balances.  
   Personas: Bookkeeper. Workflows: Receive payment / Pay bill.
5) **Bank account currency is free text** — easy to input invalid or inconsistent currency, affects posting.  
   Personas: Bookkeeper, Owner. Workflows: Bank account setup.
6) **Line item entry is dense and not mobile-friendly** — error-prone on small screens.  
   Personas: Owner on mobile, Bookkeeper. Workflows: Invoices/Bills/Expenses.
7) **Credit notes workflow is missing from UI** — core accounting action is not discoverable.  
   Personas: Bookkeeper, Accountant. Workflows: Returns/adjustments.
8) **Reconciliation matching is fully manual** — no search, suggestions, or partial matching.  
   Personas: Bookkeeper, Accountant. Workflows: Bank reconciliation.
9) **Organization settings form overload + jargon** — VAT/lock date/numbering lack guidance.  
   Personas: First-time owner. Workflows: Org setup and settings.
10) **Reports filters/exports provide weak feedback** — disabled export with no explanation; date range behavior not explained.  
    Personas: Accountant, Bookkeeper. Workflows: Reporting.

### Most Fragile Workflows
- **Invoice → Post → Receive Payment** (posting semantics + allocation friction)
- **Bill → Post → Pay** (allocation + posting ambiguity)
- **Org setup → First transaction** (long form with jargon, no guided path)
- **Bank reconciliation** (manual matching without assistance)

## 2) UX Issues Table (sorted by severity)

| # | Severity | Persona | Location (Route + File) | UX Problem (Short) |
|---|---|---|---|---|
| UX-01 | CRITICAL | Owner, Bookkeeper | `/invoices/[id]` `apps/web/app/(protected)/invoices/[id]/page.tsx` (also bills/expenses/journals) | Posting/void semantics unclear |
| UX-02 | HIGH | Owner | `/dashboard`, `/settings/organization` `apps/web/src/features/dashboard/dashboard-page.tsx`, `apps/web/app/(protected)/settings/organization/page.tsx` | No guided onboarding / first action path |
| UX-03 | HIGH | All | `/dashboard?tab=...` `apps/web/src/features/dashboard/dashboard-page.tsx`, `apps/web/app/(protected)/layout.tsx` | Core areas hidden behind query tabs |
| UX-04 | HIGH | Bookkeeper | `/payments-received/[id]` & `/vendor-payments/[id]` | Manual allocation only, no auto-apply |
| UX-05 | HIGH | Bookkeeper | `/bank-accounts` `apps/web/app/(protected)/bank-accounts/page.tsx` | Currency is free text; opening balance unclear |
| UX-06 | HIGH | Owner (mobile), Bookkeeper | `/invoices/[id]`, `/bills/[id]`, `/expenses/[id]` | Line item grid not mobile-friendly |
| UX-07 | HIGH | Bookkeeper | Missing credit note UI (no route or nav) | Core workflow not discoverable |
| UX-08 | HIGH | Bookkeeper | `/reconciliation/[id]` `apps/web/app/(protected)/reconciliation/[id]/page.tsx` | Manual matching, no assistive UX |
| UX-09 | HIGH | Owner | `/settings/organization` | Settings form overload + jargon |
| UX-10 | MEDIUM | Accountant | `/reports/*` | Filters/export lack guidance |
| UX-11 | MEDIUM | All | Multiple pages (no breadcrumb component) | No breadcrumb navigation |
| UX-12 | MEDIUM | All | Permission-gated pages | Permission blocks lack guidance |

### UX-01 — Posting/void semantics unclear
- **Severity:** CRITICAL  
- **Persona:** First-time owner, Bookkeeper  
- **Location:**  
  - `/invoices/[id]` `apps/web/app/(protected)/invoices/[id]/page.tsx`  
  - `/bills/[id]` `apps/web/app/(protected)/bills/[id]/page.tsx`  
  - `/expenses/[id]` `apps/web/app/(protected)/expenses/[id]/page.tsx`  
  - `/journals/[id]` `apps/web/app/(protected)/journals/[id]/page.tsx`
- **UX problem:** “Post” and “Void” are accounting-native terms without clear consequences or safety guardrails.
- **Why users get confused:** Non-accountants don’t know that “post” makes a transaction permanent in reports, or what “void” does vs delete.
- **What users expect:** Clear “Finalize/Record” language and a concise impact summary (balances, AR/AP, taxes).
- **Concrete UX fix:**  
  - Rename primary CTA to “Finalize & Post” (tooltip explaining ledger impact).  
  - Add a short “What will happen” block in the post dialog (reports affected, reversible via void).  
  - Add a “View reversal policy” link.
- **Example microcopy:**  
  - “Finalizing will record this in the ledger and reports. You can void it later, which creates a reversal entry.”

### UX-02 — No guided onboarding / first action path
- **Severity:** HIGH  
- **Persona:** First-time owner  
- **Location:** `/dashboard`, `/settings/organization`  
  - `apps/web/src/features/dashboard/dashboard-page.tsx`  
  - `apps/web/app/(protected)/settings/organization/page.tsx`
- **UX problem:** Setup is a long form, but there’s no “next step” flow or quick path to first invoice.
- **Why users get confused:** They don’t know what’s required vs optional; setup feels endless.
- **What users expect:** A short checklist with “Do this now” vs “Later”, and a guided first transaction.
- **Concrete UX fix:**  
  - Add a lightweight onboarding panel on `/dashboard` with 3–5 steps (org basics, customers, items, first invoice).  
  - Defer advanced settings into expandable “Advanced” sections.
- **Example microcopy:**  
  - “Get started in 10 minutes: add your org name → create a customer → send your first invoice.”

### UX-03 — Core areas hidden behind `/dashboard?tab=...`
- **Severity:** HIGH  
- **Persona:** All  
- **Location:**  
  - `apps/web/src/features/dashboard/dashboard-page.tsx`  
  - `apps/web/src/features/dashboard/use-dashboard-state.tsx`  
  - `apps/web/app/(protected)/layout.tsx`
- **UX problem:** Customers/Vendors/Items/Accounts/Taxes live inside dashboard tabs, but there is no visible tab bar on the dashboard itself.
- **Why users get confused:** Users expect `/customers` or `/vendors`, not a hidden query parameter.
- **What users expect:** Clear, dedicated routes or visible tabs.
- **Concrete UX fix:**  
  - Add visible tabs within `/dashboard` or split into distinct routes (preferred for IA).  
  - Add breadcrumbs (“Dashboard / Customers”).
- **Example microcopy:**  
  - Tab label: “Customers (Master data)”.

### UX-04 — Manual allocation only (payments)
- **Severity:** HIGH  
- **Persona:** Bookkeeper  
- **Location:**  
  - `/payments-received/[id]` `apps/web/app/(protected)/payments-received/[id]/page.tsx`  
  - `/vendor-payments/[id]` `apps/web/app/(protected)/vendor-payments/[id]/page.tsx`
- **UX problem:** Allocation requires manual entry; no auto-apply or “apply remaining”.
- **Why users get confused:** They expect “Apply to oldest invoices” or “Apply full amount” by default.
- **What users expect:** One-click allocation + clear outstanding totals.
- **Concrete UX fix:**  
  - Add “Auto-apply remaining” and “Apply to oldest” buttons.  
  - Show a “Remaining to allocate” badge near the Post button.
- **Example microcopy:**  
  - “Allocate remaining (auto).”

### UX-05 — Bank account currency is free text
- **Severity:** HIGH  
- **Persona:** Bookkeeper, Owner  
- **Location:** `/bank-accounts` `apps/web/app/(protected)/bank-accounts/page.tsx`
- **UX problem:** Currency is a free text input; no validation or selection.
- **Why users get confused:** They can enter invalid codes or mismatched currencies.
- **What users expect:** Currency dropdown with org base currency default.
- **Concrete UX fix:**  
  - Replace text input with a curated currency dropdown; show org base currency as default.  
  - Add helper text: “Use bank account’s actual currency.”
- **Example microcopy:**  
  - “Currency (bank account’s actual currency; used for reconciliation).”

### UX-06 — Line item grid is not mobile-friendly
- **Severity:** HIGH  
- **Persona:** Owner (mobile), Bookkeeper  
- **Location:**  
  - `/invoices/[id]` `apps/web/app/(protected)/invoices/[id]/page.tsx`  
  - `/bills/[id]` `apps/web/app/(protected)/bills/[id]/page.tsx`  
  - `/expenses/[id]` `apps/web/app/(protected)/expenses/[id]/page.tsx`
- **UX problem:** Large multi-column table is hard to use on smaller screens; add-line button is far below.
- **Why users get confused:** They can’t see totals or all columns without horizontal scrolling.
- **What users expect:** Mobile-friendly stacked line editor or accordion per line.
- **Concrete UX fix:**  
  - Switch to a stacked “line card” layout under a mobile breakpoint.  
  - Add a sticky “Add line” button and sticky totals.
- **Example microcopy:**  
  - “Line 1 — tap to edit details”.

### UX-07 — Credit note workflow missing from UI
- **Severity:** HIGH  
- **Persona:** Bookkeeper, Accountant  
- **Location:** (No UI route or nav entry in `apps/web/app`; no `credit-notes` screens found via search)
- **UX problem:** Core adjustment workflow is not discoverable in the UI.
- **Why users get confused:** They can’t issue credits from the UI, breaking common workflows.
- **What users expect:** Credit notes accessible from invoices or main navigation.
- **Concrete UX fix:**  
  - Add `/credit-notes` list and `/credit-notes/[id]` editor.  
  - Add “Create credit note” action on invoice detail.
- **Example microcopy:**  
  - “Create credit note for this invoice”.

### UX-08 — Reconciliation matching is fully manual
- **Severity:** HIGH  
- **Persona:** Bookkeeper, Accountant  
- **Location:** `/reconciliation/[id]` `apps/web/app/(protected)/reconciliation/[id]/page.tsx`
- **UX problem:** Matching requires manual selection of a ledger entry; no search, filtering, or partial amounts.
- **Why users get confused:** Large lists are hard to match; no guidance for splits.
- **What users expect:** Suggested matches, search by amount/date, and partial matching.
- **Concrete UX fix:**  
  - Add a search box and amount/date filters.  
  - Add optional “Match amount” field for partial matches.
- **Example microcopy:**  
  - “Suggested matches based on amount/date”.

### UX-09 — Organization settings overload + jargon
- **Severity:** HIGH  
- **Persona:** First-time owner  
- **Location:** `/settings/organization` `apps/web/app/(protected)/settings/organization/page.tsx`
- **UX problem:** One long form mixes legal identity, VAT, numbering, accounting rules, and lock date.
- **Why users get confused:** Too many accounting terms and defaults without guidance.
- **What users expect:** Step-by-step setup with contextual help.
- **Concrete UX fix:**  
  - Break into sections with accordions: “Basics”, “VAT”, “Numbering”, “Accounting controls”.  
  - Add short help text on VAT/lock date/numbering.
- **Example microcopy:**  
  - “Lock date prevents edits before this date (use after closing a period).”

### UX-10 — Reports filters & export lack guidance
- **Severity:** MEDIUM  
- **Persona:** Accountant, Bookkeeper  
- **Location:** `/reports`, `/reports/profit-loss`, `/reports/balance-sheet`, `/reports/ar-aging`  
  - e.g. `apps/web/app/(protected)/reports/profit-loss/page.tsx`
- **UX problem:** Export is disabled without explanation; date range behavior is not explained.
- **Why users get confused:** Users think export is broken or don’t know “as of” semantics.
- **What users expect:** Clear messaging on unavailable actions and filter effects.
- **Concrete UX fix:**  
  - Add disabled-state tooltip: “Export coming soon / requires permission”.  
  - Add “As of” help next to date range.
- **Example microcopy:**  
  - “Balance Sheet is ‘as of’ the end date.”

### UX-11 — No breadcrumbs for deep pages
- **Severity:** MEDIUM  
- **Persona:** All  
- **Location:** Global layout `apps/web/app/(protected)/layout.tsx`
- **UX problem:** Deep routes (e.g., `/invoices/[id]`) don’t show hierarchical navigation.
- **Why users get confused:** Hard to navigate back to list or parent context.
- **What users expect:** Breadcrumbs like “Invoices / INV-001”.
- **Concrete UX fix:** Add a breadcrumb component in the page header for all detail pages.
- **Example microcopy:**  
  - “Invoices / INV-001”.

### UX-12 — Permission blocks lack guidance
- **Severity:** MEDIUM  
- **Persona:** Operator, Staff  
- **Location:** Multiple pages using `hasPermission` guard (e.g., `reconciliation/[id]`, `settings/organization`)
- **UX problem:** Message says “You do not have permission” without next steps.
- **Why users get confused:** They don’t know who to contact or why.
- **What users expect:** Guidance to request access.
- **Concrete UX fix:**  
  - Add “Request access from admin” hint or link to organization settings.
- **Example microcopy:**  
  - “Ask an admin to grant the Reconcile permission.”

## 3) Flow Improvements

### Onboarding (Signup → Org setup → First invoice)
1) Signup → show a 3-step checklist immediately on `/dashboard`.  
2) Step 1: Org basics (name, base currency) → save.  
3) Step 2: Add first customer (inline modal).  
4) Step 3: Create first invoice (pre-filled with customer).  
5) Defer “Advanced accounting” to later (VAT, numbering, lock date).

### First Invoice (Draft → Post)
1) Create invoice (default to draft).  
2) Inline summary shows “You are about to invoice X to Customer Y”.  
3) “Finalize & Post” CTA with ledger impact and reversible note.  
4) On success, show “Next step: Receive payment”.

### First Payment
1) Payment form defaults to “Apply full amount to oldest invoice”.  
2) Provide a toggle “Manual allocation”.  
3) Show remaining and status immediately in the same view.

### Editing vs Posting
1) Draft = editable; Posted = read-only with “Void” or “Create adjustment”.  
2) Provide “Create credit note” and “Create payment” actions in context.

## 4) UX Debt Checklist
- Missing empty states with guided next steps in master data tabs under dashboard.  
- Missing breadcrumbs on detail pages.  
- Missing tooltips for accounting-specific fields (VAT, lock date, numbering).  
- Missing allocation assistance and matching suggestions in reconciliation.  
- Missing mobile-specific line editor for invoice/bill/expense line items.  
- Missing explicit confirmation language about posting irreversibility.  
- Missing explanation for disabled export buttons in reports.  
- Missing permission request guidance.

## 5) Quick Wins vs Structural UX Fixes

### Quick Wins (Low effort, high impact)
- Add breadcrumbs to all detail pages.  
- Add helper text for VAT, lock date, numbering.  
- Add tooltip for disabled export and permission blocks.  
- Rename “Post” to “Finalize & Post” with impact sentence.

### Structural UX Fixes (Require redesign)
- Split dashboard tabs into dedicated routes or a visible tab bar.  
- Add guided onboarding flow with checklist and inline actions.  
- Introduce mobile-friendly line item editor (stacked card layout).  
- Add auto-allocation and reconciliation match suggestions.

