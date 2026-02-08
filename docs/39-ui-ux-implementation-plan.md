# 39 - UI/UX Implementation Plan (Usability First)

## Objective
Make LedgerLite faster and easier to use for daily accounting work while preserving posting integrity and auditability.

## Scope
- Applies to all high-frequency transactional screens.
- Preserves current backend behavior unless explicitly noted.
- Ships in additive, non-breaking increments.

## Non-Breaking Rules
- No destructive DB changes.
- Existing API contracts remain backward compatible.
- New UI behavior is feature-flagged where workflow risk exists.
- Every UX change has regression coverage for posting flows.

## Success Metrics
- 30% reduction in form validation errors before submit.
- 20% reduction in time-to-post for invoices, bills, and payments.
- 25% reduction in support tickets tagged `navigation`, `form-error`, `posting-confusion`.
- 0 increase in accounting integrity incidents.

## Phase Plan
1. Phase 1: Form Consistency and Validation.
2. Phase 2: List/Table Usability and Navigation.
3. Phase 3: Accounting Guardrails in UI.
4. Phase 4: Workflow Guidance and Data Entry Speed.
5. Phase 5: Accessibility, Performance, and Observability.

---

## Phase 1 - Form Consistency and Validation

### UX-CORE-001 - Unified transaction form shell
As a finance user,  
I want all transaction forms to follow the same layout,  
So that I can complete tasks without relearning each screen.

Acceptance Criteria
- Invoices, Bills, Credit Notes, Debit Notes, Payments Received, Vendor Payments, Expenses, and Purchase Orders use a shared form shell.
- Field groups appear in consistent order: Header, Counterparty, Dates, Line Items, Totals, Notes, Attachments.
- Primary/secondary action placement is identical across these screens.
- Status chip placement is consistent on create and detail forms.

Backend Impact: None  
Risk Level: Low

### UX-CORE-002 - Sticky action bar on transactional forms
As a frequent data-entry user,  
I want save and post actions always visible,  
So that I do not need to scroll to complete actions.

Acceptance Criteria
- Sticky action bar includes `Save Draft`, `Post`, and `Cancel`.
- Button enabled/disabled states reflect form validity and lock status.
- Mobile/tablet layouts keep actions reachable without overlap.
- Action bar displays in-progress state on submit.

Backend Impact: None  
Risk Level: Low

### UX-CORE-003 - Inline validation standard
As a user,  
I want field-level validation messages near each error,  
So that I can fix issues quickly.

Acceptance Criteria
- Validation is shown inline for required, format, and business-rule failures.
- A compact top summary lists all field errors with click-to-focus behavior.
- Server validation errors map to field-level messages where possible.
- Error copy includes clear remediation text.

Backend Impact: Minor  
Risk Level: Low

### UX-CORE-004 - Unsaved changes protection
As a user editing a document,  
I want a warning before leaving unsaved work,  
So that I do not lose data accidentally.

Acceptance Criteria
- Route change, tab close, and browser refresh trigger unsaved warning for dirty forms.
- Explicit saves clear the dirty state.
- Post-success transitions do not show false warnings.
- Feature works on all transactional forms.

Backend Impact: None  
Risk Level: Low

---

## Phase 2 - List/Table Usability and Navigation

### UX-LIST-001 - Standardized list table framework
As an operations user,  
I want all list pages to behave consistently,  
So that filtering and actions are predictable.

Acceptance Criteria
- Common table primitives are used for all list pages.
- Columns, sorting, pagination, and row actions follow one standard.
- Empty state and loading skeleton patterns are consistent.
- Bulk selection behavior is consistent where enabled.

Backend Impact: None  
Risk Level: Medium

### UX-LIST-002 - Saved views on high-frequency lists
As a user with repeated workflows,  
I want reusable saved filters,  
So that I can return to my working sets instantly.

Acceptance Criteria
- Saved views supported for Invoices, Bills, Purchase Orders, Payments, Expenses.
- Personal views and shared-org views are clearly separated.
- Active view is visible and persistent per route.
- Create, rename, delete, and set-default operations are supported.

Backend Impact: Moderate  
Risk Level: Medium

### UX-NAV-001 - Clear breadcrumbs and screen titles
As a user navigating multi-level records,  
I want clear page context,  
So that I always know where I am.

Acceptance Criteria
- Every protected screen has a consistent page title and breadcrumb.
- Detail pages show parent module path and record reference.
- Breadcrumb links preserve list filter context when possible.
- No duplicate or conflicting labels in sidebar vs header.

Backend Impact: None  
Risk Level: Low

### UX-LIST-003 - Status counts and quick filters
As a manager,  
I want status chips and quick counts above lists,  
So that I can triage work immediately.

Acceptance Criteria
- Top chips show counts for key statuses (Draft, Posted, Overdue, Open, etc.).
- Clicking a chip applies corresponding filter.
- Counts respect permissions and org scope.
- Loading state for counts is non-blocking.

Backend Impact: Minor  
Risk Level: Low

---

## Phase 3 - Accounting Guardrails in UI

### UX-SAFE-001 - Posted document read-only guardrails
As an accountant,  
I want posted documents clearly locked,  
So that financial records are not edited by mistake.

Acceptance Criteria
- Posted records display `Posted - Locked` indicator.
- Editable controls are hidden or disabled for posted records.
- Allowed follow-up actions are limited to approved reversal/void paths.
- Attempted edit actions show explanatory guidance, not silent failure.

Backend Impact: Minor  
Risk Level: High

### UX-SAFE-002 - Lock-date pre-check before mutation
As a finance user,  
I want lock-date validation before submit/post,  
So that closed periods are protected.

Acceptance Criteria
- Forms show current lock-date context where relevant.
- Mutation actions pre-check and block on lock-date violations.
- Violation UI includes document date and lock date.
- API lock-date errors are mapped to user-friendly screen-level notices.

Backend Impact: Minor  
Risk Level: High

### UX-SAFE-003 - Standard post confirmation modal
As a user posting a transaction,  
I want an explicit confirmation with key details,  
So that irreversible actions are deliberate.

Acceptance Criteria
- Modal shows record number, posting date, totals, and warnings.
- Confirmation required for all posting-capable modules.
- Idempotency key is attached to post requests.
- Duplicate clicks do not create duplicate postings.

Backend Impact: Minor  
Risk Level: High

### UX-SAFE-004 - Consistent business error presentation
As a user,  
I want API business errors rendered consistently,  
So that corrective actions are obvious.

Acceptance Criteria
- Standard error panel shows `code`, `message`, and `hint`.
- Field-scoped errors anchor to corresponding controls.
- Conflict and validation errors use distinct UI treatment.
- Technical traces are hidden from end users.

Backend Impact: None  
Risk Level: Medium

### UX-SAFE-005 - Concurrency conflict handling
As a multi-user team member,  
I want clear conflict feedback when records change concurrently,  
So that I can safely resolve collisions.

Acceptance Criteria
- Detect stale updates and show conflict resolution prompt.
- User can reload latest version without losing local draft snapshot.
- Conflict errors are mapped from API `409` responses.
- Audit log references are available for changed records.

Backend Impact: Moderate  
Risk Level: Medium

---

## Phase 4 - Workflow Guidance and Data Entry Speed

### UX-WORK-001 - Guided empty states by module
As a first-time user,  
I want actionable empty states,  
So that I know what to do next.

Acceptance Criteria
- Empty states include a primary CTA and one short explanation.
- Optional setup dependencies are listed (e.g., create tax code, account, vendor).
- Screens with prerequisites show setup links.
- Copy is role-appropriate for accountant and operator personas.

Backend Impact: None  
Risk Level: Low

### UX-WORK-002 - Opening balances pre-post checklist UX
As a migration user,  
I want a final checklist before posting opening balances,  
So that cut-over mistakes are prevented.

Acceptance Criteria
- Checklist verifies cut-over date, balance preview, and adjustment awareness.
- Post action remains disabled until checklist is complete.
- Warning language clarifies one-time finalization.
- Completed posting redirects to read-only summary state.

Backend Impact: Minor  
Risk Level: High

### UX-WORK-003 - Reconciliation discrepancy guidance
As a finance operations user,  
I want guided mismatch handling,  
So that I can close reconciliation sessions correctly.

Acceptance Criteria
- Unmatched and partially matched items are clearly grouped.
- Remaining difference is always visible during matching.
- Split-match UI shows residual amounts in real time.
- Close button is disabled until difference equals zero.

Backend Impact: None  
Risk Level: High

### UX-WORK-004 - Keyboard-first line item entry
As a high-volume data-entry user,  
I want spreadsheet-like keyboard behavior,  
So that I can enter lines faster.

Acceptance Criteria
- Enter/Tab advances logically across line fields.
- New line can be added without mouse interaction.
- Numeric fields preserve formatting and precision rules.
- Keyboard shortcuts are documented in-line.

Backend Impact: None  
Risk Level: Medium

### UX-WORK-005 - Attachments UX consistency
As a user attaching evidence,  
I want a consistent upload and preview experience,  
So that supporting documents are easy to manage.

Acceptance Criteria
- Attachment zone and list pattern is consistent across all supported entities.
- Upload progress, success, and failure states are visible.
- Download and delete permissions are role-aware.
- File metadata (name, size, uploader, date) is displayed uniformly.

Backend Impact: Minor  
Risk Level: Medium

---

## Phase 5 - Accessibility, Performance, and Observability

### UX-A11Y-001 - Keyboard and focus accessibility baseline
As a keyboard-only user,  
I want full form and table navigation support,  
So that I can complete workflows without a mouse.

Acceptance Criteria
- Logical tab order across all major forms and tables.
- Visible focus indicators on interactive elements.
- Modal focus trap and escape handling implemented.
- No keyboard trap or hidden-focus violations in audited screens.

Backend Impact: None  
Risk Level: Medium

### UX-A11Y-002 - Contrast and semantic labeling baseline
As an accessibility user,  
I want readable interfaces with proper labels,  
So that content is perceivable and understandable.

Acceptance Criteria
- Critical text and controls meet minimum contrast requirements.
- Inputs have persistent labels and associated descriptions.
- Error messages are announced and associated to fields.
- Status chips and icons are not color-only indicators.

Backend Impact: None  
Risk Level: Medium

### UX-PERF-001 - Loading state and interaction performance standard
As a user,  
I want responsive screens with clear loading feedback,  
So that I trust the system and avoid duplicate actions.

Acceptance Criteria
- Lists and forms display skeleton/loading states under latency.
- Buttons show busy state and prevent duplicate submits.
- Route transitions avoid layout shift for core pages.
- Slow API scenarios still preserve UI responsiveness.

Backend Impact: None  
Risk Level: Medium

### UX-PERF-002 - Draft autosave for long forms
As a user entering complex transactions,  
I want safe draft autosave,  
So that interruptions do not lose work.

Acceptance Criteria
- Autosave stores draft changes at safe intervals with debounce.
- Last saved timestamp is visible.
- Post and manual save continue to work as primary controls.
- Recovery restores draft after unintentional refresh.

Backend Impact: Moderate  
Risk Level: Medium

### UX-OBS-001 - UX telemetry for funnel drop-off
As a product team,  
I want screen-level UX telemetry,  
So that we can prioritize high-friction points with evidence.

Acceptance Criteria
- Events logged for view, validation error, save draft, post success, post failure.
- Event metadata includes module, route, and non-sensitive error code.
- Dashboard reports drop-off by workflow step.
- Telemetry excludes PII and sensitive accounting values.

Backend Impact: Minor  
Risk Level: Low

---

## Delivery Cadence
1. Implement shared primitives before module-specific refactors.
2. Roll out module-by-module in this order: Bills, Purchase Orders, Invoices, Payments, Reconciliation, Opening Balances.
3. Keep old and new UI paths behind flags where workflow risk is high.

## Definition of Done (Per Story)
- UX behavior implemented and reviewed.
- Unit/integration/e2e coverage updated.
- No regression in posting, lock-date, reconciliation, or audit flows.
- Documentation updated in `docs/ux-audit` or module runbook.
