# Screen Name: Bank Transactions Import

## 1. Current LedgerLite Capabilities
- Route: `/bank-transactions/import`
- Screen file: `apps/web/app/(protected)/bank-transactions/import/page.tsx`
- Permission checks in UI: `BANK_WRITE`
- API endpoints referenced directly: `/bank-transactions/import`
- HTTP methods referenced from this screen: `POST`
- UI capabilities detected: filterRow=False, savedViews=False, statusChip=False, form=True, fieldArray=True, lockDateWarning=False, attachments=False, dialog=False
- Workflow signals: create/post actions detected

## 2. Zoho Books Capabilities
- Bank feeds + categorization + reconciliation flow with discrepancy handling.
- Support for split and match workflows in reconciliation.
- Banking views focused on unresolved items and close tasks.
- Zoho provides automated feed refresh patterns and manual refresh paths for MFA banks.

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
### ID: UX-BANKING-01

As a finance operations user,
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

### ID: UX-BANKING-02

As a finance operations user,
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

