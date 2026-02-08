# 40 - Focused UX User Stories

Scope in this file:
- Strong inline validation and human-friendly errors
- Reconciliation workflow simplification
- Reporting drill-down usability
- In-app help and empty-state guidance

## A) Strong Inline Validation and Human-Friendly Errors

### UX-VAL-01 - Field-level validation on blur and submit
**As a** user creating transactions,  
**I want** validation errors shown on the exact field when I leave it and again on submit,  
**So that** I can fix issues immediately without scanning the whole form.

**Acceptance Criteria**
- Invalid required fields show inline error text below the input.
- The first invalid field receives focus on submit.
- Error summary appears at the top with clickable field anchors.
- Errors clear immediately after valid input.

**Backend Impact**: Minor  
**Risk Level**: Low

### UX-VAL-02 - Human-readable fix hints
**As a** user,  
**I want** each error to include a plain-language fix hint,  
**So that** I understand what to change without technical wording.

**Acceptance Criteria**
- Validation messages use user language, not raw schema phrases.
- Each error includes a `Hint:` sentence (for example: "Select a tax code or set tax to 0%").
- Server-side business-rule errors map to field-level messages where possible.
- Unknown errors fall back to a safe generic message with request ID.

**Backend Impact**: Moderate  
**Risk Level**: Medium

### UX-VAL-03 - Cross-field validation visibility
**As a** user,  
**I want** cross-field issues (e.g., totals mismatch, date range invalid) displayed near related fields and in summary,  
**So that** I can resolve logical issues quickly.

**Acceptance Criteria**
- Cross-field errors point to all affected fields.
- Summary includes the same message once (no duplicates).
- Posting is blocked while cross-field errors exist.
- Keyboard users can navigate from summary to affected fields.

**Backend Impact**: Moderate  
**Risk Level**: Medium

### UX-VAL-04 - Line-item validation for table forms
**As a** user entering line items,  
**I want** per-row validation with row and column indicators,  
**So that** I can find and fix broken rows quickly.

**Acceptance Criteria**
- Invalid cells get visible error state.
- Row-level badge shows the count of issues in that row.
- Submitting scrolls to first invalid row and cell.
- Rows with no issues remain visually clean.

**Backend Impact**: Minor  
**Risk Level**: Low

## B) Reconciliation Workflow Simplification

### UX-REC-01 - Smart match suggestions
**As a** bookkeeper,  
**I want** suggested GL matches for each bank transaction,  
**So that** reconciliation takes fewer manual steps.

**Acceptance Criteria**
- Suggestions rank by amount similarity, date proximity, and reference match.
- Suggested list shows confidence label (`High`, `Medium`, `Low`).
- User can accept one suggestion in one click.
- User can ignore suggestions and manually select entries.

**Backend Impact**: Moderate  
**Risk Level**: Medium

### UX-REC-02 - Split-match UX
**As a** bookkeeper,  
**I want** to split a bank transaction across multiple GL entries in one flow,  
**So that** I can reconcile partials and mixed payments correctly.

**Acceptance Criteria**
- User can add multiple match rows.
- Remaining amount updates live after each row.
- Over-allocation is blocked with inline error.
- Reconcile action enables only when remaining amount is zero.

**Backend Impact**: Moderate  
**Risk Level**: Medium

### UX-REC-03 - Fast filters and queue states
**As a** bookkeeper,  
**I want** quick filters (`Unmatched`, `Partially Matched`, `Matched`, `Exceptions`),  
**So that** I can process reconciliation in batches.

**Acceptance Criteria**
- Filter chips update list instantly.
- Counts are shown per filter.
- Empty states explain why no records are shown.
- Filter choice persists during session.

**Backend Impact**: Minor  
**Risk Level**: Low

### UX-REC-04 - Exception resolution panel
**As a** bookkeeper,  
**I want** a dedicated exception panel for conflicts and blocked matches,  
**So that** I can resolve issues without leaving reconciliation.

**Acceptance Criteria**
- Conflicts (already matched, period lock, date out of range) show actionable reason.
- Panel provides direct next actions (`View Entry`, `Create Adjustment`, `Skip`).
- Resolved exceptions disappear without full page reload.
- Audit log captures resolution actions.

**Backend Impact**: Moderate  
**Risk Level**: Medium

## C) Reporting Usability Improvements (Drill-down)

### UX-REP-01 - Drill-down from summary rows
**As an** accountant,  
**I want** to click a P&L/TB/Aging row and view underlying transactions,  
**So that** I can explain balances with evidence.

**Acceptance Criteria**
- Clicking a row opens transaction detail list filtered to that row context.
- Filter context includes date range, org, and report basis.
- User can open source document from the drill-down list.
- Drill-down list totals match the parent row total.

**Backend Impact**: Moderate  
**Risk Level**: High

### UX-REP-02 - Breadcrumb and filter carryover
**As an** accountant,  
**I want** drill-down pages to retain report context and provide breadcrumbs,  
**So that** I can navigate back without losing analysis state.

**Acceptance Criteria**
- Breadcrumb shows `Report > Row > Transactions`.
- Returning to report keeps original filters and scroll position.
- Export from drill-down uses same context filters.
- URL fully reflects current drill-down state.

**Backend Impact**: Minor  
**Risk Level**: Low

### UX-REP-03 - Consistency checks and variance flags
**As an** accountant,  
**I want** variance flags when report row totals do not match drill-down totals,  
**So that** data integrity issues are visible early.

**Acceptance Criteria**
- System compares report row amount vs drill-down sum.
- If mismatch exists, UI shows warning badge and support message.
- Warning includes request ID for debugging.
- Warning is audit logged as a reporting integrity event.

**Backend Impact**: Moderate  
**Risk Level**: High

## D) In-App Help and Empty-State Guidance

### UX-HELP-01 - Actionable empty states
**As a** new user,  
**I want** empty pages to show what to do next,  
**So that** I can complete setup without external help.

**Acceptance Criteria**
- Empty states include short explanation, primary CTA, and optional secondary CTA.
- CTAs navigate to exact creation flow.
- Copy is module-specific (Invoices, Bills, Reconciliation, Reports).
- Empty-state events are tracked for UX analytics.

**Backend Impact**: None  
**Risk Level**: Low

### UX-HELP-02 - Context help drawer
**As a** user,  
**I want** a help drawer with concise explanations and examples on each key screen,  
**So that** I can understand accounting terms while working.

**Acceptance Criteria**
- Help drawer opens from a consistent icon placement.
- Content includes definition, when to use, and one realistic example.
- Help content is versioned and updateable without code deploy (config/content file).
- Drawer works on desktop and mobile layouts.

**Backend Impact**: Minor  
**Risk Level**: Low

### UX-HELP-03 - Inline term tooltips
**As a** user,  
**I want** tooltips for terms like `Posting Date`, `Outstanding`, and `VAT Treatment`,  
**So that** I can avoid mistakes due to unclear terminology.

**Acceptance Criteria**
- Key terms have tooltip trigger with keyboard accessibility.
- Tooltip text is under 140 characters and plain language.
- Tooltips are consistent across screens for the same term.
- Tooltip does not obscure primary input actions.

**Backend Impact**: None  
**Risk Level**: Low

### UX-HELP-04 - First-run templates for common flows
**As a** SME user,  
**I want** starter templates for first invoice, first bill, and first reconciliation,  
**So that** I can learn by example and move faster.

**Acceptance Criteria**
- Template can prefill safe demo values that user must confirm before save.
- User can choose `Use Template` or `Start Blank`.
- Template use is tracked to measure adoption.
- Templates are localized for UAE context (VAT examples).

**Backend Impact**: Minor  
**Risk Level**: Medium
