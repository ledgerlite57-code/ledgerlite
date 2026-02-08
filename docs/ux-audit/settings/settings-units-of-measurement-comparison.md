# Screen Name: Settings Units of Measurement

## 1. Current LedgerLite Capabilities
- Route: `/settings/units-of-measurement`
- Screen file: `apps/web/app/(protected)/settings/units-of-measurement/page.tsx`
- Permission checks in UI: `ITEM_READ`, `ITEM_WRITE`
- API endpoints referenced directly: `/units-of-measurement`
- HTTP methods referenced from this screen: `PATCH`, `POST`
- UI capabilities detected: filterRow=False, savedViews=False, statusChip=False, form=True, fieldArray=False, lockDateWarning=False, attachments=False, dialog=True
- Workflow signals: create/post actions detected; update actions detected

## 2. Zoho Books Capabilities
- Transaction locking and audit-oriented controls.
- Configurable accounting preferences and taxes.
- Admin-focused guardrails for organization-level controls.

## 3. Feature Gap Analysis
| Feature | Exists in LedgerLite | Exists in Zoho | Gap Type | Impact | Priority |
|---------|----------------------|---------------|----------|--------|----------|
| Inline filter bar for day-to-day segmentation | No | Yes | UX Deficiency | High | 60 |
| Saved views with reusable list criteria | No | Yes | Workflow Limitation | Medium | 45 |

Scoring model used:
- Impact Weight: Critical=5, High=4, Medium=3, Low=2
- Frequency Weight: Daily use=5, Weekly=4, Monthly=3, Rare=2
- Revenue Relevance: Directly impacts billing/cashflow=5, Indirectly impacts efficiency=3, Cosmetic=1
- Priority = Impact Weight x Frequency Weight x Revenue Relevance

## Accounting Integrity Risks
- Edit after posting: Not applicable to this screen.
- Period locking: Not applicable to this screen.
- Audit logs: Global audit page exists, but direct linkage from this screen is not evident.
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

