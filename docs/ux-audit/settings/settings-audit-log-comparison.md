# Screen Name: Settings Audit Log

## 1. Current LedgerLite Capabilities
- Route: `/settings/audit-log`
- Screen file: `apps/web/app/(protected)/settings/audit-log/page.tsx`
- Permission checks in UI: `AUDIT_VIEW`
- API endpoints referenced directly: none detected in route-level scan
- HTTP methods referenced from this screen: none detected in route-level scan
- UI capabilities detected: filterRow=False, savedViews=False, statusChip=False, form=True, fieldArray=False, lockDateWarning=False, attachments=False, dialog=True
- Workflow signals: read/list-oriented screen

## 2. Zoho Books Capabilities
- Transaction locking and audit-oriented controls.
- Configurable accounting preferences and taxes.
- Admin-focused guardrails for organization-level controls.
- Zoho exposes audit trail history and version comparison for transaction changes.

## 3. Feature Gap Analysis
| Feature | Exists in LedgerLite | Exists in Zoho | Gap Type | Impact | Priority |
|---------|----------------------|---------------|----------|--------|----------|
| Inline filter bar for day-to-day segmentation | No | Yes | UX Deficiency | High | 60 |
| Before/after diff view per transaction version | Partial | Yes | Missing Feature | High | 48 |
| Saved views with reusable list criteria | No | Yes | Workflow Limitation | Medium | 45 |
| One-click jump from audit event to source document | Partial | Yes | Workflow Limitation | Medium | 36 |

Scoring model used:
- Impact Weight: Critical=5, High=4, Medium=3, Low=2
- Frequency Weight: Daily use=5, Weekly=4, Monthly=3, Rare=2
- Revenue Relevance: Directly impacts billing/cashflow=5, Indirectly impacts efficiency=3, Cosmetic=1
- Priority = Impact Weight x Frequency Weight x Revenue Relevance

## Accounting Integrity Risks
- Edit after posting: Not applicable to this screen.
- Period locking: Not applicable to this screen.
- Audit logs: Covered by dedicated screen, but transaction-level deep-linking and diff UX may still be improved.
- Multi-user conflicts: Not applicable to this screen.
- Journal imbalance risk: Not applicable to this screen.
- Soft deletes: No delete action detected on this screen.

## 4. Recommended User Stories (Ordered by Priority)
### ID: UX-SETTINGS-01

As a finance admin,
I want inline filter bar for day-to-day segmentation,
So that the team can execute recurring work faster.

Acceptance Criteria:
- The screen exposes inline filter bar for day-to-day segmentation with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Moderate

Risk Level:
- High

### ID: UX-SETTINGS-02

As a finance admin,
I want before/after diff view per transaction version,
So that the process is more reliable and efficient.

Acceptance Criteria:
- The screen exposes before/after diff view per transaction version with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Moderate

Risk Level:
- High

### ID: UX-SETTINGS-03

As a finance admin,
I want saved views with reusable list criteria,
So that the team can execute recurring work faster.

Acceptance Criteria:
- The screen exposes saved views with reusable list criteria with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Minor

Risk Level:
- Medium

### ID: UX-SETTINGS-04

As a finance admin,
I want one-click jump from audit event to source document,
So that books remain accurate and audit-ready.

Acceptance Criteria:
- The screen exposes one-click jump from audit event to source document with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Minor

Risk Level:
- Medium

