# 38 - UX Audit Priority User Stories (Zoho Parity)

Source inputs:
- `docs/ux-audit/master-priority-roadmap.md`
- `docs/ux-audit/screen-inventory.md`
- `docs/ux-audit/<module>/*-comparison.md`

Scope:
- Detailed stories for the highest-priority gaps (Critical + High).
- UAE SME accounting focus: posting integrity, lock-date compliance, auditability, cashflow workflows.
- Non-breaking, incremental rollout.

## Phase 1 - Critical Accounting Parity

## UX-ACC-001 - Posted transaction immutability (cross-module)
**As a** finance accountant,  
**I want** posted transactions to be read-only by default,  
**So that** financial statements remain tamper-resistant after posting.

**Impacted screens**
- Journals detail, Reconciliation detail, Invoices detail, Payments Received detail, Expenses detail, Purchase Orders detail.

**Acceptance Criteria**
- Any document in `POSTED` state hides or disables mutable fields.
- Edit endpoints for posted records return a standardized `409` with actionable hint unless explicit reversal workflow is used.
- UI shows a clear read-only badge: `Posted - locked`.
- Allowed actions on posted docs are limited to permitted reversal/void flows.
- Audit log captures attempted blocked edits with user, timestamp, and record id.

**Backend Impact**: Major  
**Risk Level**: High

## UX-ACC-002 - Lock-date guardrails at action point (cross-module)
**As a** accountant,  
**I want** lock-date warnings and enforcement before post/edit,  
**So that** closed periods cannot be accidentally changed.

**Impacted screens**
- Invoices, Payments Received, Bills, Expenses, Journals, Reconciliation, Opening Balances.

**Acceptance Criteria**
- UI displays current lock date context on forms that can post or mutate accounting records.
- Before submit/post, screen performs a lock-date check and blocks with clear message when date is in locked period.
- API enforces the same rule server-side and returns `LOCK_DATE_VIOLATION`.
- Error message includes offending date and lock date in ISO format.
- E2E tests cover both UI and API rejection paths.

**Backend Impact**: Major  
**Risk Level**: High

## UX-SET-001 - Opening balances finalization checklist
**As a** finance admin,  
**I want** a mandatory pre-post checklist for opening balances,  
**So that** cut-over postings are reviewed and safe.

**Impacted screens**
- Settings > Opening Balances.

**Acceptance Criteria**
- Checklist requires: cut-over date set, draft validated, adjustment line acknowledged, trial balance preview reviewed.
- Post button is disabled until checklist is complete.
- Posting requires explicit confirmation modal including irreversible warning.
- After successful post, opening balance workflow state becomes `POSTED` and editing endpoints return `409`.
- Audit log entry includes before/after status and posting user.

**Backend Impact**: Moderate  
**Risk Level**: High

## UX-SET-002 - Opening balance import validation assistant
**As a** migration user,  
**I want** pre-import validation with row-level feedback,  
**So that** I can correct issues before draft persistence.

**Acceptance Criteria**
- CSV upload performs dry-run validation before writing draft rows.
- Errors include row number, field name, and reason.
- AR/AP control account rows are rejected with explicit message.
- Successful rows can be selectively imported after fixing invalid rows.
- Validation summary shows totals and imbalance before commit.

**Backend Impact**: Moderate  
**Risk Level**: Medium

## UX-ACC-003 - Explicit irreversible post confirmation
**As a** accountant,  
**I want** a standardized confirmation modal for post actions,  
**So that** irreversible transitions are deliberate.

**Impacted screens**
- Invoices, Credit Notes, Payments Received, Bills, Debit Notes, Expenses, Vendor Payments, Journals, Purchase Orders.

**Acceptance Criteria**
- Post actions always open a modal summarizing: document number, posting date, totals, lock-date check result.
- User must explicitly confirm to continue.
- Modal can be cancelled without side effects.
- On confirm, request includes idempotency key to avoid double-submit.
- Duplicate post attempts return previous result or conflict without duplicate ledger entries.

**Backend Impact**: Moderate  
**Risk Level**: High

## UX-AUD-001 - Transaction-level audit deep links
**As a** auditor,  
**I want** direct links between transaction pages and audit events,  
**So that** investigations are fast and complete.

**Acceptance Criteria**
- Each transaction detail page has `View Audit Trail` action filtered to current entity.
- Audit log rows include link back to the entity detail page.
- Filters preserve org scope and permission checks.
- Access is denied for users missing `AUDIT_LOG_READ`.
- Query parameters are stable and shareable.

**Backend Impact**: Minor  
**Risk Level**: Medium

## Phase 2 - Workflow and Automation

## UX-PUR-001 - Purchase order status lifecycle controls
**As a** AP user,  
**I want** explicit PO states (`Draft`, `Open`, `Partially Billed`, `Billed`, `Cancelled`),  
**So that** procurement progress is visible and controllable.

**Impacted screens**
- Purchase Orders list/detail (including legacy alias routes).

**Acceptance Criteria**
- PO status transitions follow valid state machine rules.
- UI surfaces current state with status chip and timeline events.
- Invalid transitions are blocked with clear guidance.
- List screen supports filtering by PO status.
- Status changes are audited.

**Backend Impact**: Major  
**Risk Level**: High

## UX-PUR-002 - PO to Bill line-level conversion tracking
**As a** AP accountant,  
**I want** line-level billed quantity/amount tracking from PO to Bills,  
**So that** partial billing and vendor reconciliation are accurate.

**Acceptance Criteria**
- PO line tracks ordered, billed, and remaining quantity/amount.
- Creating a bill from PO pre-fills remaining lines only.
- Over-billing blocked unless explicit override permission is granted.
- PO status auto-updates based on line completion.
- Detail page shows linked bills per line.

**Backend Impact**: Major  
**Risk Level**: High

## UX-PUR-003 - Vendor payment posting safeguards
**As a** AP user,  
**I want** posting checks and confirmation for vendor payments,  
**So that** cash and AP balances stay accurate.

**Acceptance Criteria**
- Posting validates allocated amount <= outstanding bills.
- Confirmation modal summarizes selected bills and total payment.
- Over-allocation returns business error with corrected maximum.
- Posted payments lock allocation fields.
- Reversal flow preserves auditability and updates bill balances.

**Backend Impact**: Moderate  
**Risk Level**: High

## UX-SAL-001 - Sales document posting safeguards
**As a** AR user,  
**I want** consistent posting checks for invoices/credit notes/payments,  
**So that** receivables and revenue are posted correctly.

**Acceptance Criteria**
- Posting validates required fields and document totals before ledger write.
- Credit note application cannot exceed invoice outstanding.
- Payment allocations cannot exceed invoice outstanding.
- UI surfaces allocation remaining in real time.
- Failed post attempts return standardized error object with hint.

**Backend Impact**: Moderate  
**Risk Level**: High

## UX-REP-001 - Report scheduling (P&L, BS, TB, VAT, Aging)
**As a** finance manager,  
**I want** scheduled report runs with email/export delivery,  
**So that** monthly and weekly close routines are automated.

**Acceptance Criteria**
- User can schedule daily/weekly/monthly runs per report with saved filters.
- Output can be CSV/PDF and emailed to selected recipients.
- Scheduled runs respect org timezone and permissions.
- Failed jobs are retriable and logged.
- Audit log records schedule create/update/delete and run outcome.

**Backend Impact**: Major  
**Risk Level**: Medium

## UX-BNK-001 - Reconciliation discrepancy resolution workflow
**As a** finance operations user,  
**I want** guided discrepancy resolution before session close,  
**So that** bank reconciliation is complete and defensible.

**Acceptance Criteria**
- Session close blocked unless statement difference is zero.
- UI shows unresolved/mismatched transactions with recommended actions.
- Split-match remains supported with remaining amount indicators.
- Closing a session writes immutable snapshot of matched items.
- Reopen is permission-gated and fully audited.

**Backend Impact**: Moderate  
**Risk Level**: High

## Phase 3 - UX and Efficiency Enhancements

## UX-LST-001 - Consistent filter row + saved views on high-frequency lists
**As a** finance team member,  
**I want** filter row and saved views on every high-frequency list,  
**So that** repetitive operational work is faster.

**Impacted screens**
- Purchases lists, Sales lists, Reports index and key report screens, Settings lists.

**Acceptance Criteria**
- Filter row appears on target list/report screens with consistent pattern.
- Saved views support create, rename, update, delete.
- Views are scoped by org and user.
- URL query can reconstruct current filter state.
- Pagination and sorting preserve selected view.

**Backend Impact**: Minor  
**Risk Level**: Medium

## UX-DOC-001 - Attachments on all transactional detail pages
**As a** accountant,  
**I want** attachment upload/list/delete on transactional detail pages,  
**So that** source evidence is available during review and audit.

**Acceptance Criteria**
- Supported file types and max size are clearly displayed.
- Upload uses secure storage adapter and stores metadata in DB.
- Attachment permissions inherit from parent transaction permissions.
- Delete is soft-delete or hard-delete per retention policy and audited.
- Download links are short-lived and access-controlled.

**Backend Impact**: Moderate  
**Risk Level**: Medium

## UX-REP-002 - Comparative report presets
**As a** finance manager,  
**I want** period-over-period presets on key reports,  
**So that** trend analysis does not require manual exports.

**Acceptance Criteria**
- Reports support presets: This Month vs Last Month, YTD vs Prior YTD, Custom compare.
- Percent and absolute variance columns are available.
- Preset selection is included in saved views.
- Report totals and subtotals remain consistent across compare modes.
- Export output preserves compare columns.

**Backend Impact**: Moderate  
**Risk Level**: Medium

## UX-NAV-001 - Legacy purchase order route hard redirect
**As a** user opening legacy links,  
**I want** deterministic redirects to canonical purchase order routes,  
**So that** navigation is stable and no page appears missing.

**Acceptance Criteria**
- `/purchaseorder`, `/purchaseorder/new`, `/purchaseorder/{id}` redirect to canonical `/purchase-orders...` routes.
- Redirects preserve query params when safe.
- 404 is shown only for truly missing ids, not route alias mismatch.
- Navigation menus only expose canonical paths.
- E2E tests cover all legacy aliases.

**Backend Impact**: None  
**Risk Level**: Low

## Phase 4 - Advanced Intelligence and AI (Optional)

## UX-AI-001 - Reconciliation match suggestions
**As a** finance operations user,  
**I want** suggested matches for bank transactions,  
**So that** reconciliation time is reduced without sacrificing control.

**Acceptance Criteria**
- Suggestions are ranked with confidence score and explanation.
- User can accept, edit, or reject each suggestion.
- No auto-post without user confirmation.
- Suggestion engine respects lock date and posted immutability.
- Accepted suggestions are auditable.

**Backend Impact**: Major  
**Risk Level**: Medium

## UX-AI-002 - Close-period exception assistant
**As a** finance manager,  
**I want** prioritized exception alerts (lock-date, imbalance, missing allocations),  
**So that** close blockers are resolved quickly.

**Acceptance Criteria**
- Dashboard widget lists top unresolved accounting exceptions by severity.
- Each exception deep-links to exact remediation screen.
- Alerts are org-scoped and permission-aware.
- Exceptions auto-resolve after corrective transaction.
- Historical trend of exceptions is available monthly.

**Backend Impact**: Major  
**Risk Level**: Medium

---

## Delivery Order Recommendation
1. Implement Phase 1 stories first (`UX-ACC-*`, `UX-SET-*`, `UX-AUD-*`).
2. Implement Purchase and Sales workflow stories next (`UX-PUR-*`, `UX-SAL-*`, `UX-BNK-*`).
3. Implement cross-screen efficiency and reporting enhancements (`UX-LST-*`, `UX-DOC-*`, `UX-REP-*`, `UX-NAV-*`).
4. Keep AI stories behind feature flags.
