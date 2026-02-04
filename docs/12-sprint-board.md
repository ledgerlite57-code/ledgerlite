# 12 - Sprint Board (Execution Plan)

## Purpose

This sprint board turns `docs/10-accounting-improvements-roadmap.md` and `docs/11-accounting-user-stories.md` into an execution-ready plan.

Related backlog extensions:
- `docs/18-release-identification-and-public-ux-user-stories.md`
- `docs/19-release-identification-and-public-ux-implementation-tasks.md`
- `docs/20-inventory-and-ops-usability-user-stories.md`
- `docs/21-inventory-and-ops-usability-implementation-tasks.md`
- `docs/22-auth-onboarding-monitoring-admin-user-stories.md`
- `docs/23-auth-onboarding-monitoring-admin-implementation-tasks.md`

## Planning assumptions

- Sprint length: 2 weeks
- Planned capacity: ~45 story points per sprint
- Team shape: 1 backend-focused, 1 frontend-focused, 1 fullstack, 1 QA/automation
- Story point scale: 3, 5, 8, 13
- Board status at creation: **Planned** (no sprint started)

## Definition of done (for every story)

1. Acceptance criteria in `docs/11-accounting-user-stories.md` are met.
2. Org-scoped authorization and idempotency are preserved.
3. Audit logging exists for all critical create/post/void/approval actions.
4. Unit/integration/e2e tests cover happy path + key failure paths.
5. Feature flag and rollback path are documented for risky releases.

---

## Portfolio board by sprint

| Sprint | Phase | Goal | Story IDs | Planned Points | Status |
| --- | --- | --- | --- | ---: | --- |
| Sprint 1 | Phase 1 (P0) | Accounting hardening foundation + invite lifecycle | `US-P1-HARD-001`, `US-P1-HARD-002`, `US-P1-HARD-005`, `US-P1-ONB-002`, `US-P1-ONB-001` | 31 | Planned |
| Sprint 2 | Phase 1 (P0) | Settlement/aging correctness + reconciliation automation MVP | `US-P1-HARD-003`, `US-P1-HARD-004`, `US-P1-BNK-001`, `US-P1-TAX-002` | 34 | Planned |
| Sprint 3 | Phase 1 (P0) | Core inventory + close + VAT filing workspace | `US-P1-INV-001`, `US-P1-INV-002`, `US-P1-INV-003`, `US-P1-GL-001`, `US-P1-TAX-001` | 42 | Planned |
| Sprint 4 | Phase 2 (P1) | Inventory operations expansion + UX guidance | `US-P2-INV-001`, `US-P2-INV-002`, `US-P2-BNK-001`, `US-P2-ONB-001`, `US-P2-ONB-003`, `US-P2-SAL-004` | 44 | Planned |
| Sprint 5 | Phase 2 (P1) | Procurement controls + revenue ops baseline | `US-P2-PUR-001`, `US-P2-PUR-002`, `US-P2-PUR-003`, `US-P2-SAL-001`, `US-P2-SAL-003`, `US-P2-GL-001` | 44 | Planned |
| Sprint 6 | Phase 2 (P1) | Advanced inventory + bank integration + recurring billing | `US-P2-INV-003`, `US-P2-INV-004`, `US-P2-INV-005`, `US-P2-BNK-002`, `US-P2-SAL-002` | 45 | Planned |
| Sprint 7 | Phase 2 (P1) | Tax/compliance readiness + import + accounting engine expansion | `US-P2-ONB-002`, `US-P2-GL-002`, `US-P2-GL-003`, `US-P2-TAX-001`, `US-P2-TAX-002` | 50 | Planned |
| Sprint 8 | Phase 3 (P2) | Growth features and management intelligence | `US-P3-SAL-001`, `US-P3-PUR-001`, `US-P3-BNK-001`, `US-P3-GL-001`, `US-P3-GL-002` | 37 | Planned |

---

## Sprint-by-sprint breakdown

## Sprint 1 - Accounting hardening foundation

**Objective:** fix highest-risk accounting logic gaps first, then improve invite onboarding control.

| Story ID | Story | Points | Primary lane | Key dependency |
| --- | --- | ---: | --- | --- |
| `US-P1-HARD-001` | As-of-date inventory costing | 8 | Backend | Inventory movement date and costing policy |
| `US-P1-HARD-002` | High-precision quantity in cost engine | 5 | Backend | Decimal precision policy |
| `US-P1-HARD-005` | Negative stock policy control | 5 | Backend + Frontend | Item/stock balance query support |
| `US-P1-ONB-002` | Invite lifecycle management | 5 | Fullstack | SMTP + invite status model |
| `US-P1-ONB-001` | Role-based onboarding checklist | 8 | Frontend + Backend | User role and checklist persistence |

**Sprint exit criteria**
- Hardening stories AL-001/AL-002/AL-005 are test-covered and enabled behind feature flags.
- Invite flow supports resend/revoke/status without breaking current accept flow.

## Sprint 2 - Settlement correctness + reconciliation MVP

**Objective:** make AR/AP aging consistent with real settlement behavior and deliver auto-match MVP.

| Story ID | Story | Points | Primary lane | Key dependency |
| --- | --- | ---: | --- | --- |
| `US-P1-HARD-003` | Unified settlement logic for aging | 8 | Backend | Consistent settlement event model |
| `US-P1-HARD-004` | Credit note application to AR aging | 8 | Backend | Credit application model |
| `US-P1-BNK-001` | Rules-based auto reconciliation | 13 | Fullstack | Reconciliation matching engine |
| `US-P1-TAX-002` | Tax invoice compliance checker | 5 | Backend + Frontend | Validation framework in posting flow |

**Sprint exit criteria**
- Aging reconciles against expected settlement types in regression suite.
- Reconciliation rules can be configured and applied with audit trace.

## Sprint 3 - Inventory operations + close + VAT workspace

**Objective:** deliver operational inventory controls and compliance-close workflows.

| Story ID | Story | Points | Primary lane | Key dependency |
| --- | --- | ---: | --- | --- |
| `US-P1-INV-001` | Inventory adjustment workflow | 13 | Fullstack | GL + inventory posting integration |
| `US-P1-INV-002` | Stock on hand dashboard | 8 | Frontend + Backend | Inventory summary API |
| `US-P1-INV-003` | Reorder automation | 5 | Fullstack | Reorder point and suggestion logic |
| `US-P1-GL-001` | Period close checklist | 8 | Fullstack | Lock-date and close state model |
| `US-P1-TAX-001` | VAT return workspace | 8 | Fullstack | VAT box mapping and export |

**Sprint exit criteria**
- Phase 1 critical stories are production-ready behind staged rollout flags.
- Close checklist and VAT workspace usable end-to-end for a sample period.

## Sprint 4 - Inventory operations expansion + UX guidance

| Story ID | Story | Points | Primary lane | Key dependency |
| --- | --- | ---: | --- | --- |
| `US-P2-INV-001` | Warehouses and locations | 13 | Backend + Frontend | Location model and movement updates |
| `US-P2-INV-002` | Stock count / cycle count | 8 | Fullstack | Adjustment workflow from Sprint 3 |
| `US-P2-BNK-001` | Split/merge reconciliation UX | 8 | Frontend + Backend | Reconciliation MVP from Sprint 2 |
| `US-P2-ONB-001` | SMTP quality/trust improvements | 5 | Backend | Mail template + delivery telemetry |
| `US-P2-ONB-003` | In-app accounting guidance | 5 | Frontend | Shared hint/error components |
| `US-P2-SAL-004` | Customer statement packs | 5 | Fullstack | AR aging consistency from Sprint 2 |

## Sprint 5 - Procurement controls + revenue ops baseline

| Story ID | Story | Points | Primary lane | Key dependency |
| --- | --- | ---: | --- | --- |
| `US-P2-PUR-001` | Purchase orders + 3-way match | 13 | Fullstack | PO lifecycle + bill posting guard |
| `US-P2-PUR-002` | Bill approvals by threshold | 8 | Fullstack | Approval policy engine |
| `US-P2-PUR-003` | Vendor prepayment clearing UX | 5 | Frontend + Backend | AP settlement rules |
| `US-P2-SAL-001` | Quotes/estimates to invoice | 8 | Fullstack | Sales document conversion flow |
| `US-P2-SAL-003` | Dunning automation | 5 | Backend + Frontend | Reminder scheduling and logs |
| `US-P2-GL-001` | Auto-reversing journals | 5 | Backend | Journal posting/reversal scheduler |

## Sprint 6 - Advanced inventory + bank integration + recurring billing

| Story ID | Story | Points | Primary lane | Key dependency |
| --- | --- | ---: | --- | --- |
| `US-P2-INV-003` | Batch/lot/serial + expiry | 13 | Fullstack | Location-aware inventory model |
| `US-P2-INV-004` | Landed cost allocation | 8 | Backend | Bill/inventory valuation integration |
| `US-P2-INV-005` | Inventory valuation reports | 8 | Backend + Frontend | Accurate valuation ledger data |
| `US-P2-BNK-002` | Bank feed integration foundation | 8 | Backend + Frontend | Import adapter framework |
| `US-P2-SAL-002` | Recurring invoices | 8 | Fullstack | Job scheduling + invoice template |

## Sprint 7 - Compliance readiness + accounting engine expansion

| Story ID | Story | Points | Primary lane | Key dependency |
| --- | --- | ---: | --- | --- |
| `US-P2-ONB-002` | Data import wizard | 8 | Fullstack | CSV validation and idempotent import |
| `US-P2-GL-002` | Accrual/deferral schedules | 8 | Backend | Journal automation |
| `US-P2-GL-003` | Fixed asset register + depreciation | 13 | Fullstack | Asset model + periodic posting |
| `US-P2-TAX-001` | eInvoicing readiness layer | 13 | Backend + Integration | Structured payload + status model |
| `US-P2-TAX-002` | Corporate tax reporting pack | 8 | Backend + Frontend | Tagged adjustment reporting |

## Sprint 8 - Growth features and management intelligence

| Story ID | Story | Points | Primary lane | Key dependency |
| --- | --- | ---: | --- | --- |
| `US-P3-SAL-001` | Customer portal lite | 5 | Fullstack | Secure external document access |
| `US-P3-PUR-001` | Expense OCR and extraction | 8 | Integration + Fullstack | OCR pipeline + review queue |
| `US-P3-BNK-001` | Cash forecast with due schedules | 8 | Backend + Frontend | Reliable AR/AP due data |
| `US-P3-GL-001` | Budget vs actual | 8 | Backend + Frontend | Budget model + variance engine |
| `US-P3-GL-002` | Dimension tags (project/cost center) | 8 | Fullstack | Dimension model + report filters |

---

## Release gates by phase

### Gate A - End of Phase 1

- All Phase 1 stories complete.
- Hardening stories (`US-P1-HARD-*`) pass regression on posting/void/aging.
- No unresolved Sev-1/Sev-2 defects in accounting workflows.

### Gate B - End of Phase 2

- All Phase 2 stories complete.
- Compliance stories validated with sample UAE reporting datasets.
- Data migration/import repeatability confirmed.

### Gate C - End of Phase 3

- All Phase 3 stories complete.
- UAT signoff by accounting users and operations users.
- Performance and observability checks pass for production scale.

---

## Risk watchlist (tracking with this board)

- **Accounting correctness drift risk:** prioritize `US-P1-HARD-*` before feature expansion.
- **Scope risk in Sprint 7:** if capacity tight, split `US-P2-GL-003` depreciation posting from full fixed asset lifecycle.
- **Integration uncertainty risk:** OCR and eInvoicing provider dependencies may require parallel spike tickets.
- **Change management risk:** onboarding and guidance stories should ship with feature discovery prompts to reduce support load.
