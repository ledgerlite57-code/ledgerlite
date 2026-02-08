# UX Audit Master Priority Roadmap

Generated from `docs/ux-audit-routes.json` on 2026-02-07 20:50:38 +04:00.

## Coverage Summary
- Screens audited: 46
- Total feature gaps identified: 214

## Top 20 Highest Impact Features Across Entire System
| Rank | Module | Screen | Feature | Gap Type | Impact | Priority Score |
|------|--------|--------|---------|----------|--------|---------------|
| 1 | purchases | Purchase Order Legacy Detail | Line-level PO to Bill conversion visibility | Automation Missing | High | 80 |
| 2 | purchases | Purchase Order Legacy Detail | Explicit post/confirm action with irreversible warning | Workflow Limitation | High | 80 |
| 3 | sales | Credit Notes | Explicit post/confirm action with irreversible warning | Workflow Limitation | High | 80 |
| 4 | purchases | Purchase Order Legacy New | PO status lifecycle controls (Open/Partially Billed/Billed/Cancelled) in one screen | Workflow Limitation | High | 80 |
| 5 | accounting | Journals | Explicit post/confirm action with irreversible warning | Workflow Limitation | High | 80 |
| 6 | misc | Expenses | Explicit post/confirm action with irreversible warning | Workflow Limitation | High | 80 |
| 7 | accounting | Journals Detail | Posted-state immutability cues in UI | Compliance Risk | Critical | 75 |
| 8 | accounting | Journals | Visible period-lock warning at point of edit/post | Compliance Risk | Critical | 75 |
| 9 | banking | Reconciliation | Posted-state immutability cues in UI | Compliance Risk | Critical | 75 |
| 10 | sales | Payments Received | Visible period-lock warning at point of edit/post | Compliance Risk | Critical | 75 |
| 11 | sales | Invoices | Posted-state immutability cues in UI | Compliance Risk | Critical | 75 |
| 12 | banking | Reconciliation | Visible period-lock warning at point of edit/post | Compliance Risk | Critical | 75 |
| 13 | purchases | Purchase Order Legacy New | Visible period-lock warning at point of edit/post | Compliance Risk | Critical | 75 |
| 14 | purchases | Purchase Order Legacy Detail | Posted-state immutability cues in UI | Compliance Risk | Critical | 75 |
| 15 | settings | Settings Opening Balances | Visible period-lock warning at point of edit/post | Compliance Risk | Critical | 75 |
| 16 | settings | Settings Opening Balances | Posted-state immutability cues in UI | Compliance Risk | Critical | 75 |
| 17 | misc | Expenses Detail | Posted-state immutability cues in UI | Compliance Risk | Critical | 75 |
| 18 | misc | Expenses | Visible period-lock warning at point of edit/post | Compliance Risk | Critical | 75 |
| 19 | reports | Reports VAT Summary | Inline filter bar for day-to-day segmentation | UX Deficiency | High | 60 |
| 20 | settings | Settings Organization | Inline filter bar for day-to-day segmentation | UX Deficiency | High | 60 |

## Top 10 Immediate Actions
1. [purchases] Line-level PO to Bill conversion visibility (`Purchase Order Legacy Detail`), Priority Score: 80
2. [purchases] Explicit post/confirm action with irreversible warning (`Purchase Order Legacy Detail`), Priority Score: 80
3. [sales] Explicit post/confirm action with irreversible warning (`Credit Notes`), Priority Score: 80
4. [purchases] PO status lifecycle controls (Open/Partially Billed/Billed/Cancelled) in one screen (`Purchase Order Legacy New`), Priority Score: 80
5. [accounting] Explicit post/confirm action with irreversible warning (`Journals`), Priority Score: 80
6. [misc] Explicit post/confirm action with irreversible warning (`Expenses`), Priority Score: 80
7. [accounting] Posted-state immutability cues in UI (`Journals Detail`), Priority Score: 75
8. [accounting] Visible period-lock warning at point of edit/post (`Journals`), Priority Score: 75
9. [banking] Posted-state immutability cues in UI (`Reconciliation`), Priority Score: 75
10. [sales] Visible period-lock warning at point of edit/post (`Payments Received`), Priority Score: 75

## Critical Accounting Risks
| Module | Screen | Risk | Priority Score |
|--------|--------|------|---------------|
| settings | Settings Opening Balances | Visible period-lock warning at point of edit/post | 75 |
| purchases | Purchase Order Legacy Detail | Posted-state immutability cues in UI | 75 |
| purchases | Purchase Order Legacy New | Visible period-lock warning at point of edit/post | 75 |
| misc | Expenses | Visible period-lock warning at point of edit/post | 75 |
| misc | Expenses Detail | Posted-state immutability cues in UI | 75 |
| settings | Settings Opening Balances | Posted-state immutability cues in UI | 75 |
| banking | Reconciliation | Posted-state immutability cues in UI | 75 |
| accounting | Journals | Visible period-lock warning at point of edit/post | 75 |
| accounting | Journals Detail | Posted-state immutability cues in UI | 75 |
| banking | Reconciliation | Visible period-lock warning at point of edit/post | 75 |
| sales | Invoices | Posted-state immutability cues in UI | 75 |
| sales | Payments Received | Visible period-lock warning at point of edit/post | 75 |
| settings | Settings Opening Balances | Cut-over integrity checklist (lock date + approval + final preview signoff) | 50 |

## Competitive Parity Score
| Module | Estimated Parity with Zoho (%) | Notes |
|--------|----------------------------------|-------|
| sales | 55 | Derived from screen capability signals detected in code. |
| purchases | 40 | Derived from screen capability signals detected in code. |
| banking | 43.3 | Derived from screen capability signals detected in code. |
| inventory | 15 | No dedicated inventory pages detected in current route scan. |
| reports | 22.9 | Derived from screen capability signals detected in code. |
| settings | 37.5 | Derived from screen capability signals detected in code. |
| dashboard | 0 | Derived from screen capability signals detected in code. |

## Recommended Phase Plan
### Phase 1: Critical Accounting Parity
- Lock-date and posted-state immutability UX across all transactional detail screens.
- Auditability improvements: transaction-level audit trail links and posting evidence.
- Integrity hardening for opening balances and reconciliation critical paths.

### Phase 2: Workflow & Automation
- Purchase flow maturity (PO lifecycle and PO-to-Bill line progression visibility).
- Report scheduling and recurring operational automation.
- High-frequency list productivity (filters, saved views, reusable presets).

### Phase 3: UX & Efficiency Enhancements
- Confirmation dialogs and better irreversible-action messaging.
- Better attachment/document context on transactional screens.
- Consistent list and detail affordances across all modules.

### Phase 4: Advanced Intelligence & AI
- Predictive reconciliation suggestions and anomaly surfacing.
- Smart remediation guidance for close-period exceptions.
- Prioritized task recommendations based on aging, cashflow, and VAT risk.
