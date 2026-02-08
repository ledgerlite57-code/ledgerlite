# Screen Name: Debit Notes

## 1. Current LedgerLite Capabilities
- Route: `/debit-notes`
- Screen file: `apps/web/app/(protected)/debit-notes/page.tsx`
- Permission checks in UI: `BILL_READ`
- API endpoints referenced directly: none detected in route-level scan
- HTTP methods referenced from this screen: none detected in route-level scan
- UI capabilities detected: filterRow=True, savedViews=True, statusChip=True, form=False, fieldArray=False, lockDateWarning=False, attachments=False, dialog=False
- Workflow signals: read/list-oriented screen

## 2. Zoho Books Capabilities
- Purchase orders, bills, vendor credits, and vendor payment workflows are tightly linked.
- Document status lifecycle and conversion flows (PO to Bill).
- Operational productivity features around list filters, quick actions, and traceability.

## 3. Feature Gap Analysis
| Feature | Exists in LedgerLite | Exists in Zoho | Gap Type | Impact | Priority |
|---------|----------------------|---------------|----------|--------|----------|
| Explicit post/confirm action with irreversible warning | Partial | Yes | Workflow Limitation | High | 80 |
| Visible period-lock warning at point of edit/post | No | Yes | Compliance Risk | Critical | 75 |
| Posted-state immutability cues in UI | Not Evident | Yes | Compliance Risk | Critical | 75 |
| Optimistic concurrency guard for multi-user edits | Not Evident | Yes | Performance Risk | High | 48 |
| Native attachment handling on transaction screen | No | Yes | Missing Feature | High | 48 |
| Confirmation modal for destructive/irreversible actions | No | Yes | UX Deficiency | Medium | 36 |
| Direct audit trail jump from transaction details | Partial | Yes | Workflow Limitation | Medium | 36 |

Scoring model used:
- Impact Weight: Critical=5, High=4, Medium=3, Low=2
- Frequency Weight: Daily use=5, Weekly=4, Monthly=3, Rare=2
- Revenue Relevance: Directly impacts billing/cashflow=5, Indirectly impacts efficiency=3, Cosmetic=1
- Priority = Impact Weight x Frequency Weight x Revenue Relevance

## Accounting Integrity Risks
- Edit after posting: Not evident in this screen scan.
- Period locking: Potential risk. No lock-date warning affordance detected in this screen.
- Audit logs: Global audit page exists, but direct linkage from this screen is not evident.
- Multi-user conflicts: Potential risk. No optimistic concurrency indicator detected from route-level scan.
- Journal imbalance risk: Potential risk unless backend posting checks block imbalance consistently; UI-level balance cues vary by screen.
- Soft deletes: No delete action detected on this screen.

## 4. Recommended User Stories (Ordered by Priority)
### ID: UX-PURCHASES-01

As a accounts payable accountant,
I want explicit post/confirm action with irreversible warning,
So that the process is more reliable and efficient.

Acceptance Criteria:
- The screen exposes explicit post/confirm action with irreversible warning with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Moderate

Risk Level:
- High

### ID: UX-PURCHASES-02

As a accounts payable accountant,
I want visible period-lock warning at point of edit/post,
So that books remain accurate and audit-ready.

Acceptance Criteria:
- The screen exposes visible period-lock warning at point of edit/post with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Major

Risk Level:
- High

### ID: UX-PURCHASES-03

As a accounts payable accountant,
I want posted-state immutability cues in ui,
So that books remain accurate and audit-ready.

Acceptance Criteria:
- The screen exposes posted-state immutability cues in ui with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Major

Risk Level:
- High

### ID: UX-PURCHASES-04

As a accounts payable accountant,
I want optimistic concurrency guard for multi-user edits,
So that the process is more reliable and efficient.

Acceptance Criteria:
- The screen exposes optimistic concurrency guard for multi-user edits with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Moderate

Risk Level:
- High

### ID: UX-PURCHASES-05

As a accounts payable accountant,
I want native attachment handling on transaction screen,
So that supporting evidence is always traceable.

Acceptance Criteria:
- The screen exposes native attachment handling on transaction screen with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Moderate

Risk Level:
- High

### ID: UX-PURCHASES-06

As a accounts payable accountant,
I want confirmation modal for destructive/irreversible actions,
So that the process is more reliable and efficient.

Acceptance Criteria:
- The screen exposes confirmation modal for destructive/irreversible actions with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- None

Risk Level:
- Medium

