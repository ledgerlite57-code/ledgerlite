# Screen Name: Journals Detail

## 1. Current LedgerLite Capabilities
- Route: `/journals/{id}`
- Screen file: `apps/web/app/(protected)/journals/[id]/page.tsx`
- Permission checks in UI: `JOURNAL_POST`, `JOURNAL_WRITE`
- API endpoints referenced directly: `/accounts`, `/journals`, `/orgs/current`
- HTTP methods referenced from this screen: `PATCH`, `POST`
- UI capabilities detected: filterRow=False, savedViews=False, statusChip=True, form=True, fieldArray=True, lockDateWarning=True, attachments=False, dialog=True
- Workflow signals: create/post actions detected; update actions detected

## 2. Zoho Books Capabilities
- Journal operations with posting controls and traceability.
- Period protection and high-integrity correction workflows.
- Auditability around financial adjustments.

## 3. Feature Gap Analysis
| Feature | Exists in LedgerLite | Exists in Zoho | Gap Type | Impact | Priority |
|---------|----------------------|---------------|----------|--------|----------|
| Posted-state immutability cues in UI | Not Evident | Yes | Compliance Risk | Critical | 75 |
| Native attachment handling on transaction screen | No | Yes | Missing Feature | High | 48 |
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
- Soft deletes: No delete action detected on this screen.

## 4. Recommended User Stories (Ordered by Priority)
### ID: UX-ACCOUNTING-01

As a general ledger accountant,
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

### ID: UX-ACCOUNTING-02

As a general ledger accountant,
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

### ID: UX-ACCOUNTING-03

As a general ledger accountant,
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

### ID: UX-ACCOUNTING-04

As a general ledger accountant,
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

