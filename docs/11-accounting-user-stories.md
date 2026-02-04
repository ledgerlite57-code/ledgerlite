# 11 - Accounting User Stories (Phase-by-Phase)

## Purpose

This file breaks down the roadmap in `docs/10-accounting-improvements-roadmap.md` into detailed user stories, ordered by priority and necessity.

## Prioritization model used

- **Phase 1 (Critical / P0):** must-have controls and usability wins that directly affect correctness, compliance, and daily adoption.
- **Phase 2 (Core Expansion / P1):** high-value capabilities that improve throughput, control, and reporting depth.
- **Phase 3 (Scale / P2):** advanced capabilities for optimization and growth.

---

## Phase 1 (0-6 weeks) - Critical (P0)

### US-P1-INV-001 - Inventory Adjustment Workflow
- **Story:** As an accountant, I want a dedicated inventory adjustment flow so I can post shrinkage, damage, and correction entries with an audit trail.
- **Necessity:** Inventory accuracy and valuation integrity.
- **Acceptance Criteria:**
  1. User can create draft adjustment with date, reason code, notes, and item lines (qty/value).
  2. Posting creates `InventoryMovement` records with source type `ADJUSTMENT` and linked GL entry.
  3. Reversal/void is controlled by role and lock date rules.
  4. Every create/post/void action is written to audit log with before/after payload.

### US-P1-INV-002 - Stock On Hand Dashboard
- **Story:** As an operations user, I want a single stock dashboard so I can see on-hand qty, stock value, and low-stock items instantly.
- **Necessity:** Reduce time-to-information for daily operations.
- **Acceptance Criteria:**
  1. Dashboard shows on-hand quantity and stock value by item in base unit.
  2. User can filter by item type/status and search by SKU/name.
  3. Dashboard highlights low-stock items based on reorder point.
  4. Totals reconcile to inventory movement ledger for the same as-of date.

### US-P1-INV-003 - Reorder Automation
- **Story:** As a purchaser, I want reorder suggestions so I can restock before stockouts.
- **Necessity:** Prevent lost sales and emergency buying.
- **Acceptance Criteria:**
  1. System flags items where available quantity <= reorder point.
  2. Suggested reorder quantity is generated using configurable safety buffer.
  3. User can convert selected suggestions into draft purchase documents.
  4. Low-stock notification appears in dashboard and can be acknowledged.

### US-P1-BNK-001 - Rules-Based Auto Reconciliation
- **Story:** As a finance user, I want reconciliation rules so repetitive bank matches can be auto-suggested.
- **Necessity:** Manual matching does not scale.
- **Acceptance Criteria:**
  1. User can define rules by description pattern, reference, amount tolerance, and direction.
  2. System proposes matches with confidence score and match reason.
  3. User can bulk accept/reject suggestions before session close.
  4. Manual override remains available and audited.

### US-P1-GL-001 - Period Close Checklist
- **Story:** As a finance lead, I want a close checklist so month-end can be completed consistently and safely.
- **Necessity:** Prevent accidental posting gaps and incomplete close.
- **Acceptance Criteria:**
  1. Checklist includes unposted docs, unreconciled sessions, VAT readiness, and lock-date readiness.
  2. Checklist status is visible by period and by owner.
  3. Period cannot be locked until mandatory checks are complete or explicitly overridden by authorized role.
  4. Lock action stores user/time/reason in audit trail.

### US-P1-TAX-001 - VAT Return Workspace (VAT201 Mapping)
- **Story:** As a tax preparer, I want box-level VAT mapping so I can prepare VAT201 accurately.
- **Necessity:** Compliance and filing confidence.
- **Acceptance Criteria:**
  1. Workspace maps transactions/accounts to VAT201 boxes for selected period.
  2. System shows box totals, net VAT, and drill-down to source entries.
  3. User can mark period as reviewed/ready.
  4. Export package includes period totals and transaction support.

### US-P1-TAX-002 - Tax Invoice Compliance Checker
- **Story:** As a billing user, I want invoice compliance checks before posting so non-compliant invoices are blocked early.
- **Necessity:** Reduce legal/compliance risk.
- **Acceptance Criteria:**
  1. Pre-post validation checks required tax invoice fields and VAT metadata.
  2. Errors are actionable and field-specific.
  3. User can save draft with warnings, but posting is blocked for critical compliance failures.
  4. Validation outcomes are logged.

### US-P1-ONB-001 - Role-Based Onboarding Checklist
- **Story:** As a new user, I want guided onboarding by role so I can reach first transaction quickly.
- **Necessity:** Increase activation and reduce setup drop-off.
- **Acceptance Criteria:**
  1. Onboarding path differs for owner/accountant/operator roles.
  2. Checklist covers org profile, chart defaults, tax setup, bank setup, and first transaction.
  3. Progress persists between sessions.
  4. Completion state is visible to admins.

### US-P1-ONB-002 - Invite Lifecycle Management
- **Story:** As an admin, I want to resend, revoke, and track invites so user provisioning is reliable.
- **Necessity:** Operational control and smoother team onboarding.
- **Acceptance Criteria:**
  1. Invite list shows status: pending, accepted, expired, revoked.
  2. Admin can resend and revoke pending invites.
  3. Invite expiry is configurable with safe defaults.
  4. All lifecycle actions are audit-logged.

---

## Phase 2 (6-12 weeks) - Core Expansion (P1)

### Inventory & Stock

### US-P2-INV-001 - Warehouses and Locations
- **Story:** As an inventory manager, I want multi-location stock tracking so branch-level availability is accurate.
- **Acceptance Criteria:**
  1. System supports warehouses/locations and transfer transactions.
  2. Every stock movement carries location context.
  3. On-hand reporting is available per location and consolidated.

### US-P2-INV-002 - Stock Count / Cycle Count
- **Story:** As a store manager, I want stock count sessions so physical count variances can be posted correctly.
- **Acceptance Criteria:**
  1. User can create count session with scope and freeze date.
  2. Variances are calculated and posted via adjustment workflow.
  3. Count results and approvals are auditable.

### US-P2-INV-003 - Batch/Lot/Serial + Expiry
- **Story:** As a regulated-goods seller, I want lot/serial tracking so traceability and expiry control are possible.
- **Acceptance Criteria:**
  1. Items can be configured for lot/serial tracking.
  2. Inbound/outbound movements capture lot/serial and expiry.
  3. Reports can trace movement history by lot/serial.

### US-P2-INV-004 - Landed Cost Allocation
- **Story:** As an accountant, I want landed costs allocated to stock so inventory valuation includes true acquisition cost.
- **Acceptance Criteria:**
  1. User can create landed cost entries (freight/duty/fees).
  2. Allocation methods are configurable (qty/value/weight).
  3. Allocation updates item valuation and posts balancing GL lines.

### US-P2-INV-005 - Inventory Valuation Reports
- **Story:** As finance leadership, I want valuation and movement reports so stock and COGS can be trusted.
- **Acceptance Criteria:**
  1. Reports include stock valuation, stock aging, movement ledger, and COGS by item.
  2. Reports are filterable by date, item, and location.
  3. Report totals reconcile with GL inventory balances.

### Sales & Receivables

### US-P2-SAL-001 - Quotes/Estimates to Invoice
- **Story:** As a sales user, I want quote-to-invoice conversion so commercial workflow is seamless.
- **Acceptance Criteria:**
  1. User can create versioned quotes with status lifecycle.
  2. Approved quote converts to draft invoice without re-entry.
  3. Conversion preserves tax, terms, and item details.

### US-P2-SAL-002 - Recurring Invoices
- **Story:** As a service business owner, I want recurring invoice templates so repeat billing is automated.
- **Acceptance Criteria:**
  1. User can define recurrence frequency and start/end dates.
  2. System generates draft invoices on schedule.
  3. Failures and skips are visible in recurrence logs.

### US-P2-SAL-003 - Dunning Automation
- **Story:** As collections staff, I want automated reminders so overdue follow-up is consistent.
- **Acceptance Criteria:**
  1. Reminder cadence can be configured by aging bucket.
  2. Outbound reminder history is visible per invoice/customer.
  3. Users can pause reminders for disputed invoices.

### US-P2-SAL-004 - Customer Statement Packs
- **Story:** As AR staff, I want customer statement packs so outstanding balances are easy to communicate.
- **Acceptance Criteria:**
  1. Statement includes opening balance, activity, and closing balance.
  2. Overdue invoices are grouped by aging bucket.
  3. Pack can be downloaded and emailed.

### Purchases & Payables

### US-P2-PUR-001 - Purchase Orders + 3-Way Match
- **Story:** As procurement/accounting, I want PO and matching controls so unauthorized billing is reduced.
- **Acceptance Criteria:**
  1. User can create/approve PO and record receipt.
  2. Bill posting can enforce PO/receipt match tolerance.
  3. Exceptions require authorized override and are logged.

### US-P2-PUR-002 - Bill Approvals by Threshold
- **Story:** As a manager, I want threshold-based approvals so high-value bills get review.
- **Acceptance Criteria:**
  1. Approval rules can be set by amount/vendor/category.
  2. Bills over threshold cannot post without approval.
  3. Approval chain and timestamps are auditable.

### US-P2-PUR-003 - Vendor Prepayment Clearing UX
- **Story:** As AP staff, I want guided prepayment allocation so clearing vendor advances is easy and accurate.
- **Acceptance Criteria:**
  1. Allocation wizard shows outstanding bills and available prepayment balance.
  2. System prevents over-allocation.
  3. Allocation updates bill status and GL consistently.

### Banking & Reconciliation

### US-P2-BNK-001 - Split/Merge Reconciliation UX
- **Story:** As a reconciler, I want split/merge matching so complex statements can be matched correctly.
- **Acceptance Criteria:**
  1. One bank line can be split across multiple GL entries.
  2. Multiple bank lines can be matched to one GL entry when valid.
  3. Remaining amount is shown live before save.

### US-P2-BNK-002 - Bank Feed Integrations Foundation
- **Story:** As an SME owner, I want direct or preset bank imports so reconciliation setup is faster.
- **Acceptance Criteria:**
  1. Connector framework supports pluggable bank feed providers.
  2. CSV format presets for common UAE bank statements are supported.
  3. Import health and duplicate handling are visible to users.

### GL, Close, and Controls

### US-P2-GL-001 - Auto-Reversing Journals
- **Story:** As an accountant, I want journals that auto-reverse next period so accrual handling is faster.
- **Acceptance Criteria:**
  1. Journal supports optional reversal date at creation.
  2. Scheduled reversal posts automatically on reversal date.
  3. Link between original and reversal is traceable.

### US-P2-GL-002 - Accrual/Deferral Schedules
- **Story:** As finance, I want amortization schedules so prepaid/deferred balances are recognized correctly.
- **Acceptance Criteria:**
  1. User can define recognition schedule parameters.
  2. System posts periodic journal entries from schedule.
  3. Remaining balance and schedule status are visible.

### US-P2-GL-003 - Fixed Asset Register + Depreciation
- **Story:** As finance, I want fixed asset register and depreciation schedules so capitalization lifecycle is controlled.
- **Acceptance Criteria:**
  1. Asset register stores acquisition, useful life, method, and salvage value.
  2. Depreciation run posts periodic entries with audit references.
  3. Disposal workflow handles gain/loss posting.

### UAE Tax/Compliance

### US-P2-TAX-001 - eInvoicing Readiness Layer
- **Story:** As a compliance owner, I want an eInvoicing-ready data layer so future UAE mandates can be adopted quickly.
- **Acceptance Criteria:**
  1. Invoice payload model captures required structured attributes.
  2. Provider integration abstraction exists for ASP/connectors.
  3. Submission state machine tracks pending/sent/accepted/rejected.

### US-P2-TAX-002 - Corporate Tax Reporting Pack
- **Story:** As tax preparer, I want a corporate tax pack so period-end tax prep is repeatable.
- **Acceptance Criteria:**
  1. Pack includes P&L bridge, adjustments, and supporting schedules.
  2. Adjustments are tagged and drillable to source entries.
  3. Export format supports advisor review.

### Onboarding, Email, and Usability

### US-P2-ONB-001 - SMTP Quality and Trust Improvements
- **Story:** As admin, I want reliable invite email delivery so onboarding failures are minimized.
- **Acceptance Criteria:**
  1. Branded invite template supports organization identity.
  2. Delivery failures are surfaced in app with actionable hints.
  3. Sender verification checks run before sending.

### US-P2-ONB-002 - Data Import Wizard
- **Story:** As migrating customer, I want import wizards so I can onboard data without manual re-entry.
- **Acceptance Criteria:**
  1. CSV import supports customers, vendors, items, and opening balances.
  2. Preview validates rows and highlights errors before commit.
  3. Import is idempotent and provides result summary.

### US-P2-ONB-003 - In-App Accounting Guidance
- **Story:** As non-accountant user, I want contextual guidance so posting errors are easy to fix.
- **Acceptance Criteria:**
  1. Critical forms include contextual hints and plain-language error guidance.
  2. Posting preview explains impacted accounts before confirmation.
  3. Error banners provide reason + recommended next action.

---

## Phase 3 (12-20 weeks) - Scale (P2)

### US-P3-SAL-001 - Customer Portal Lite
- **Story:** As a customer, I want secure invoice access so I can view/download/pay without email back-and-forth.
- **Acceptance Criteria:**
  1. Shared secure link supports invoice view/download and status tracking.
  2. Access is scoped to customer-specific documents.
  3. Activity is logged for audit.

### US-P3-PUR-001 - Expense OCR and Extraction
- **Story:** As AP staff, I want OCR-assisted capture so bill entry time is reduced.
- **Acceptance Criteria:**
  1. Uploaded receipts are parsed into draft expense/bill lines.
  2. Confidence score flags fields needing review.
  3. User approval is required before posting.

### US-P3-BNK-001 - Cash Forecast with Due Schedules
- **Story:** As owner/CFO, I want forward-looking cash forecasts so I can make proactive cash decisions.
- **Acceptance Criteria:**
  1. Forecast uses receivable/payable due dates and recurring obligations.
  2. View supports 30/60/90-day horizons.
  3. Variance is shown versus actual cash movement.

### US-P3-GL-001 - Budget vs Actual
- **Story:** As management, I want budget vs actual reporting so performance variance is visible.
- **Acceptance Criteria:**
  1. Budgets can be defined by account and period.
  2. Reports show actual, budget, variance amount, and variance %.
  3. Drill-down to GL lines is supported.

### US-P3-GL-002 - Dimension Tags (Project/Cost Center)
- **Story:** As finance analyst, I want dimensional tagging so profitability can be analyzed by project/cost center.
- **Acceptance Criteria:**
  1. Dimensions are optional on transactional and journal lines.
  2. Validation enforces active dimensions when required by policy.
  3. Reports can filter/group by dimension.

---

## Accounting logic issues observed in current implementation (to address early)

The following are code-observed risks that can produce accounting/reporting mismatches. These should be prioritized alongside Phase 1.

### AL-001 - Inventory fallback costing uses all positive history without date cut-off
- **Observed in code:** `apps/api/src/common/inventory-cost.ts:76-84` loads positive `inventoryMovement` records with no transaction-date boundary.
- **Risk:** Backdated invoice/credit note posting can use cost from future purchases, distorting historical COGS.
- **Recommended fix story:** Add as-of-date constrained cost resolution and period-consistent costing policy.

### AL-002 - Quantity precision loss in fallback cost averaging
- **Observed in code:** `apps/api/src/common/inventory-cost.ts:95-97` rounds running quantity with `round2`, while inventory quantities are modeled at 4 decimals (`schema.prisma` line-level qty fields).
- **Risk:** Fractional quantity businesses can accumulate valuation drift.
- **Recommended fix story:** Preserve quantity precision (>=4 dp) in cost accumulation and round only monetary outputs.

### AL-003 - AR/AP aging ignores cleared PDC allocations
- **Observed in code:**
  - PDC clear updates `invoice.amountPaid`/`bill.amountPaid` (`apps/api/src/modules/pdc/pdc.service.ts:715-737`, `793-815`).
  - AR aging only subtracts `PaymentReceivedAllocation` (`apps/api/src/modules/reports/reports.service.ts:795-806`, `814-817`).
  - AP aging only subtracts `VendorPaymentAllocation` (`apps/api/src/modules/reports/reports.service.ts:908-919`, `927-930`).
- **Risk:** Aging reports can overstate outstanding balances when PDC has cleared.
- **Recommended fix story:** Unify aging source-of-truth to include all posted settlement types (payments + cleared PDC + any future settlement docs).

### AL-004 - AR aging does not account for customer credit notes linked to invoices
- **Observed in code:**
  - Credit notes can link to invoice (`apps/api/prisma/schema.prisma:572-590`).
  - Credit note posting credits AR (`apps/api/src/credit-notes.utils.ts:93-100`).
  - AR aging computes `invoice.total - payment allocations` only (`apps/api/src/modules/reports/reports.service.ts:815-817`).
- **Risk:** Customer-level AR aging can diverge from net AR reality when credits exist.
- **Recommended fix story:** Add credit memo application model and include applied credits in aging calculations.

### AL-005 - No stock-availability guard on inventory issue posting
- **Observed in code:** Inventory issue movement creation in invoice flow posts negative quantity directly (`apps/api/src/modules/invoices/invoices.service.ts:1106-1115`) with no available-balance validation.
- **Risk:** Negative stock can be posted silently, reducing data trust for operations.
- **Recommended fix story:** Configurable negative-stock policy (block/warn/allow) with override audit.

---

## Phase 1 hardening stories for the logic issues above

### US-P1-HARD-001 - As-of-Date Inventory Costing
- **Story:** As finance, I want inventory cost lookup constrained to transaction effective date so historical COGS is accurate.
- **Acceptance Criteria:**
  1. Cost fallback query is bounded by document effective date.
  2. Backdated postings produce same cost regardless of future purchases.
  3. Regression tests cover backdated invoice and credit-note scenarios.

### US-P1-HARD-002 - High-Precision Quantity in Cost Engine
- **Story:** As finance, I want quantity precision preserved in valuation math so fractional UOM businesses are accurate.
- **Acceptance Criteria:**
  1. Quantity accumulation uses at least 4 decimal precision.
  2. Monetary values remain rounded to currency precision.
  3. Test cases validate no drift across repeated fractional movements.

### US-P1-HARD-003 - Unified Settlement Logic for Aging
- **Story:** As collections/AP user, I want aging to reflect all posted settlements so outstanding balances are trustworthy.
- **Acceptance Criteria:**
  1. AR/AP aging includes posted payments and cleared PDC settlements.
  2. Aging totals reconcile with account balances within period rules.
  3. Reconciliation tests cover payment, PDC clear, and bounce paths.

### US-P1-HARD-004 - Credit Note Application to AR Aging
- **Story:** As AR accountant, I want applied customer credits to reduce invoice outstanding so aging reflects net collectible.
- **Acceptance Criteria:**
  1. Credit note application state is explicit and auditable.
  2. Applied credit reduces invoice outstanding and updates aging.
  3. Unapplied credits are shown separately as customer credit balance.

### US-P1-HARD-005 - Negative Stock Policy Control
- **Story:** As operations controller, I want configurable negative stock rules so posting behavior matches policy.
- **Acceptance Criteria:**
  1. Org policy supports block, warn, or allow negative stock.
  2. Blocking policy prevents post when on-hand would go below zero.
  3. Overrides require permission and are audit-logged.

---

## Delivery notes

- Keep all new features behind feature flags.
- Preserve org-scoped query enforcement and idempotency for all new mutating APIs.
- Add end-to-end posting/reversal regression tests before enabling each phase in production.
