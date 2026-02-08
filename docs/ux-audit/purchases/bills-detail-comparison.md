# Screen Name: Bills Detail

## 1. Current LedgerLite Capabilities
- Route: `/bills/{id}`
- Screen file: `apps/web/app/(protected)/bills/[id]/page.tsx`
- Permission checks in UI: `BILL_POST`, `BILL_WRITE`
- API endpoints referenced directly: `/accounts`, `/attachments`, `/bills`, `/debit-notes`, `/orgs/current`
- HTTP methods referenced from this screen: `DELETE`, `PATCH`, `POST`
- UI capabilities detected: filterRow=False, savedViews=False, statusChip=True, form=True, fieldArray=True, lockDateWarning=True, attachments=True, dialog=True
- Workflow signals: create/post actions detected; update actions detected; delete actions detected

## 2. Zoho Books Capabilities
- Purchase orders, bills, vendor credits, and vendor payment workflows are tightly linked.
- Document status lifecycle and conversion flows (PO to Bill).
- Operational productivity features around list filters, quick actions, and traceability.

## 3. Feature Gap Analysis
| Feature | Exists in LedgerLite | Exists in Zoho | Gap Type | Impact | Priority |
|---------|----------------------|---------------|----------|--------|----------|
| Posted-state immutability cues in UI | Not Evident | Yes | Compliance Risk | Critical | 75 |
| Optimistic concurrency guard for multi-user edits | Not Evident | Yes | Performance Risk | High | 48 |
| Direct audit trail jump from transaction details | Partial | Yes | Workflow Limitation | Medium | 36 |

Scoring model used:
- Impact Weight: Critical=5, High=4, Medium=3, Low=2
- Frequency Weight: Daily use=5, Weekly=4, Monthly=3, Rare=2
- Revenue Relevance: Directly impacts billing/cashflow=5, Indirectly impacts efficiency=3, Cosmetic=1
- Priority = Impact Weight x Frequency Weight x Revenue Relevance

## Accounting Integrity Risks
- Edit after posting: Potential risk. Edit/delete actions are present in this screen scan; posted-state immutability is not explicitly confirmed here.
- Period locking: Partially covered. A lock-date warning is visible in this screen.
- Audit logs: Global audit page exists, but direct linkage from this screen is not evident.
- Multi-user conflicts: Potential risk. No optimistic concurrency indicator detected from route-level scan.
- Journal imbalance risk: Potential risk unless backend posting checks block imbalance consistently; UI-level balance cues vary by screen.
- Soft deletes: Potential risk. Delete action exists; restore/archive behavior is not evident in this screen scan.

## 4. Recommended User Stories (Ordered by Priority)
### ID: UX-PURCHASES-01

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

### ID: UX-PURCHASES-02

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

### ID: UX-PURCHASES-03

As a accounts payable accountant,
I want direct audit trail jump from transaction details,
So that books remain accurate and audit-ready.

Acceptance Criteria:
- The screen exposes direct audit trail jump from transaction details with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Minor

Risk Level:
- Medium

