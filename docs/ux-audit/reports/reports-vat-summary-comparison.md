# Screen Name: Reports VAT Summary

## 1. Current LedgerLite Capabilities
- Route: `/reports/vat-summary`
- Screen file: `apps/web/app/(protected)/reports/vat-summary/page.tsx`
- Permission checks in UI: `REPORTS_VIEW`
- API endpoints referenced directly: none detected in route-level scan
- HTTP methods referenced from this screen: none detected in route-level scan
- UI capabilities detected: filterRow=False, savedViews=False, statusChip=False, form=True, fieldArray=False, lockDateWarning=False, attachments=False, dialog=False
- Workflow signals: read/list-oriented screen

## 2. Zoho Books Capabilities
- High-utility report presets with filters and period comparison.
- Drilldown and export flows for accountant review cycles.
- Strong focus on aging, VAT, and statutory reporting usability.
- Zoho emphasizes export-ready accounting reports and period-driven review.

## 3. Feature Gap Analysis
| Feature | Exists in LedgerLite | Exists in Zoho | Gap Type | Impact | Priority |
|---------|----------------------|---------------|----------|--------|----------|
| Inline filter bar for day-to-day segmentation | No | Yes | UX Deficiency | High | 60 |
| Saved views with reusable list criteria | No | Yes | Workflow Limitation | Medium | 45 |
| Expanded comparative filters (period-over-period presets) | Partial | Yes | Workflow Limitation | Medium | 36 |
| Report scheduling and periodic email delivery | No | Yes | Automation Missing | Medium | 27 |

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
### ID: UX-REPORTS-01

As a finance manager,
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

### ID: UX-REPORTS-02

As a finance manager,
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

### ID: UX-REPORTS-03

As a finance manager,
I want expanded comparative filters (period-over-period presets),
So that the team can execute recurring work faster.

Acceptance Criteria:
- The screen exposes expanded comparative filters (period-over-period presets) with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Minor

Risk Level:
- Medium

### ID: UX-REPORTS-04

As a finance manager,
I want report scheduling and periodic email delivery,
So that the process is more reliable and efficient.

Acceptance Criteria:
- The screen exposes report scheduling and periodic email delivery with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Moderate

Risk Level:
- Medium

