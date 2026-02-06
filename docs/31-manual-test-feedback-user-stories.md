# 31 - Manual Test Feedback: Prioritized User Stories + Task Breakdown

This document converts the latest manual-test findings and questions into detailed user stories, ordered by priority. UI/UX improvements are prioritized. Backend impacts are called out explicitly.

---

## P0 â€” Correctness & Trust (must not mislead users)

### UX-P0-01 â€” Payment posting error must never show success + error
**As a** user posting a payment,  
**I want** a clear success or failure state (not both),  
**So that** I can trust the system and avoid duplicate actions.

**Problem observed**
- On posting a payment, UI shows: â€œSomething went wrong / Cannot read properties of undefined (reading 'id')â€ even though the payment is posted.

**Acceptance Criteria**
- Posting a payment shows either success or failure, never both.
- If the API responds with success but UI cannot parse the response, the UI shows a fallback success state and logs a client error (without blocking the user).
- Post action is idempotent and the user can safely retry without duplicate posting.

**Tasks (in order)**
1. **Frontend**: Harden the post handler to tolerate missing fields in response and handle `result.payment` as optional.
2. **Frontend**: Show a generic success message when HTTP status is 200/201 and response payload is incomplete.
3. **Backend**: Ensure `POST /payments-received/:id/post` always returns `{ payment: PaymentRecord }`.
4. **Tests**: Add a UI unit test to simulate missing `payment` in payload and verify a safe success state.

**Backend impact**: Possibly update API response shape / add contract tests.

---

### UX-P0-02 â€” Trial Balance â€œInvalid tokenâ€ must be resolved
**As a** user viewing Trial Balance,  
**I want** stable access without random â€œinvalid tokenâ€ errors,  
**So that** reporting feels reliable and secure.

**Problem observed**
- Trial balance endpoint fails with â€œinvalid tokenâ€.

**Acceptance Criteria**
- No â€œinvalid tokenâ€ errors during normal browsing.
- If a token expires, the app silently refreshes and retries.
- If refresh fails, user gets a clean â€œsession expiredâ€ prompt.

**Tasks (in order)**
1. **Frontend**: Confirm `apiFetch` retries on 401 for `/reports/trial-balance`.
2. **Frontend**: Add a global session-expired banner/modal when refresh fails.
3. **Backend**: Ensure refresh cookies are configured correctly for current domain.
4. **Config**: Consider increasing access token TTL if too short for real workflows.

**Backend impact**: Session/refresh config.

---

## P1 â€” Workflow Clarity & Reduced Errors

### UX-P1-01 â€” â€œReceive Paymentâ€ should support Cash / Undeposited Funds
**As a** user receiving a payment,  
**I want** to deposit into Cash or Undeposited Funds (not only bank accounts),  
**So that** I can handle offline or pooled deposits.

**Acceptance Criteria**
- â€œDeposit toâ€ field supports:
  - Bank accounts
  - Cash account
  - Optional â€œUndeposited Fundsâ€ account
- If Cash is selected, no bank account is required.
- Ledger preview reflects the chosen account.

**Tasks (in order)**
1. **Backend**: Allow payment posting to a non-bank GL account (asset subtype or â€œUNDPCâ€).
2. **Backend**: Update validation to permit non-bank account when allowed.
3. **Frontend**: Replace â€œBank Accountâ€ field with â€œDeposit Toâ€ and include cash/undeposited options.
4. **Frontend**: Update ledger preview labels.
5. **Tests**: Add tests for cash/undeposited posting.

**Backend impact**: Posting logic + validation.

---

### UX-P1-02 â€” Make edit action obvious in list views
**As a** user browsing lists (Invoices, Bills, Payments),  
**I want** a clearly visible â€œView/Editâ€ action,  
**So that** I donâ€™t miss how to open a record.

**Acceptance Criteria**
- Each list row has a visible action (â€œViewâ€ or â€œEditâ€).
- First column remains clickable, but is no longer the only clue.
- Row hover indicates clickability (cursor + subtle highlight).

**Tasks (in order)**
1. **Frontend**: Add action column or trailing icon button in each list.
2. **Frontend**: Add hover state and â€œOpenâ€ affordance.
3. **UX copy**: Add â€œClick row to viewâ€ helper text (optional).

**Backend impact**: None.

---

### UX-P1-03 â€” Clarify PDC terms and statuses
**As a** user working with PDC,  
**I want** simple language for direction and status,  
**So that** I understand the lifecycle quickly.

**Acceptance Criteria**
- Replace â€œIncoming/Outgoingâ€ with â€œReceived Chequeâ€ / â€œIssued Chequeâ€.
- Provide short helper text explaining **Scheduled**.
- Status transitions are shown as a compact timeline or badge + tooltip.

**Tasks (in order)**
1. **Frontend**: Update labels on list and detail screens.
2. **Frontend**: Add tooltip/help text for statuses.
3. **Docs**: Add a small â€œPDC flowâ€ description in-app (or help panel).

**Backend impact**: None (label-only).

---

### UX-P1-04 â€” Fix journal line removal and inline validation
**As a** user entering journals,  
**I want** simple line management + clear validation,  
**So that** I can post without confusion.

**Acceptance Criteria**
- Remove line is enabled whenever more than 2 lines exist.
- Inline validation shows:
  - â€œEnter either debit or credit.â€
  - â€œDebits must equal credits.â€
- A balance footer always shows difference in real time.

**Tasks (in order)**
1. **Frontend**: Ensure delete button only disables at 2 lines.
2. **Frontend**: Highlight line errors + show difference summary.
3. **UX**: Add â€œAuto-balanceâ€ toggle (optional in P2).

**Backend impact**: None.

---

## P2 â€” Feature Gaps & Naming Clarity

### UX-P2-01 â€” Debit Notes / Purchase Returns
**As a** user returning goods to a vendor,  
**I want** debit notes (purchase returns),  
**So that** purchases are corrected cleanly.

**Acceptance Criteria**
- A â€œPurchase Returnâ€ (debit note) document exists.
- It can be posted, voided, and applied to bills.
- It appears in AP aging and AP ledger.

**Tasks (in order)**
1. **Backend**: Add DebitNote model + posting logic.
2. **Backend**: Add apply/unapply to bills.
3. **Frontend**: New list + detail pages.
4. **Reports**: Include in AP aging and cash-basis logic.

**Backend impact**: New models + posting + reporting.

---

### UX-P2-02 â€” Rename Credit/Debit Notes for non-accountants
**As a** small business user,  
**I want** friendly terms,  
**So that** I know what the action means.

**Acceptance Criteria**
- â€œCredit Notesâ€ labeled as **Sales Returns** (secondary: â€œCredit Noteâ€).
- â€œDebit Notesâ€ labeled as **Purchase Returns** (secondary: â€œDebit Noteâ€).
- Tooltips explain the accounting term.

**Tasks**
1. **Frontend**: Add display-name mapping.
2. **UX**: Add small tooltip or help text.

**Backend impact**: None.

---

### UX-P2-03 â€” Partial credit note application UX
**As a** user,  
**I want** to apply credit notes partially with clarity,  
**So that** invoice outstanding is accurate.

**Acceptance Criteria**
- Apply dialog shows remaining credit available.
- Inline â€œApply remainingâ€ button fills the amount.
- Prevent over-application with clear message.

**Tasks**
1. **Frontend**: Add â€œremaining creditâ€ to apply UI.
2. **Backend**: Confirm allocation total validations.
3. **Tests**: Apply partial credit and confirm invoice outstanding.

**Backend impact**: None, if API already supports allocations.

---

## P3 â€” Education & Guidance

### UX-P3-01 â€” Explain default ledger accounts on item creation
**As a** user creating an item,  
**I want** clear guidance on ledger defaults,  
**So that** I donâ€™t misclassify transactions.

**Acceptance Criteria**
- Show â€œUsed when selling this itemâ€ / â€œUsed for COGSâ€ hints.
- Warn if a non-standard account type is chosen.
- Role-based restrictions for changing defaults (optional).

**Tasks**
1. **Frontend**: Add microcopy and warnings.
2. **Backend**: Optional policy checks for accountants only.

**Backend impact**: Optional.

---

### UX-P3-02 â€” Explain SKU meaning and usage
**As a** user,  
**I want** to know what SKU is,  
**So that** I can decide whether to use it.

**Acceptance Criteria**
- Tooltip: â€œSKU = internal stock code; leave blank to auto-generate.â€
- Auto-generated format shown as example.

**Tasks**
1. **Frontend**: Add tooltip/help text.

**Backend impact**: None.

---

### UX-P3-03 â€” Bank reconciliation explainers
**As a** user,  
**I want** a clear explanation of bank reconciliation,  
**So that** I can reconcile confidently.

**Acceptance Criteria**
- Explain purpose + example scenario in the Reconciliation page.
- Add a short â€œHow toâ€ checklist.

**Tasks**
1. **Frontend**: Add inline guide panel.

**Backend impact**: None.

---

### UX-P3-04 â€” Session timeout expectation
**As a** user,  
**I want** to understand session duration,  
**So that** Iâ€™m not surprised by logouts.

**Acceptance Criteria**
- Add a tooltip on login/session settings.
- Optional: â€œKeep me signed inâ€ (longer access TTL with refresh).

**Tasks**
1. **Frontend**: Add small session info.
2. **Backend**: Optional TTL config updates.

**Backend impact**: Optional.

---

## P4 â€” Dashboard Enhancements

### UX-P4-01 â€” Add summary KPI cards
**As a** business user,  
**I want** a richer dashboard overview,  
**So that** I can scan key metrics quickly.

**Acceptance Criteria**
- Add cards for:
  - AR Outstanding
  - AP Outstanding
  - Overdue Invoices
  - Overdue Bills
  - Cash on Hand
  - Inventory Value (if inventory enabled)
- Cards link to detail pages when relevant.

**Tasks**
1. **Frontend**: Add card UI + data mapping.
2. **Backend**: Add dashboard summary fields as needed.

**Backend impact**: Possibly add summary endpoints.

---

## Notes & Recommendations

**Top Recommendations**
1. Fix the payment post UI error first (trust).
2. Resolve token refresh/expiry stability for reports.
3. Make â€œDeposit toâ€ flexible (cash/undeposited).
4. Improve edit affordances on list pages.
5. Simplify PDC terms and statuses.

---

## Suggested Implementation Order (Short Version)
1. UX-P0-01, UX-P0-02  
2. UX-P1-01, UX-P1-02  
3. UX-P1-03, UX-P1-04  
4. UX-P2-03, UX-P2-02  
5. UX-P2-01 (Debit Notes)  
6. UX-P3 series  
7. UX-P4-01




