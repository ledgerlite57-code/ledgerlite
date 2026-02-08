# Screen Name: PDC

## 1. Current LedgerLite Capabilities
- Route: `/pdc`
- Screen file: `apps/web/app/(protected)/pdc/page.tsx`
- Permission checks in UI: `PDC_WRITE`
- API endpoints referenced directly: none detected in route-level scan
- HTTP methods referenced from this screen: none detected in route-level scan
- UI capabilities detected: filterRow=True, savedViews=True, statusChip=True, form=False, fieldArray=False, lockDateWarning=False, attachments=False, dialog=False
- Workflow signals: read/list-oriented screen

## 2. Zoho Books Capabilities
- Bank feeds + categorization + reconciliation flow with discrepancy handling.
- Support for split and match workflows in reconciliation.
- Banking views focused on unresolved items and close tasks.

## 3. Feature Gap Analysis
| Feature | Exists in LedgerLite | Exists in Zoho | Gap Type | Impact | Priority |
|---------|----------------------|---------------|----------|--------|----------|
| Screen-specific automation parity improvements | Partial | Yes | Workflow Limitation | Low | 4 |

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
I want screen-specific automation parity improvements,
So that repetitive close work is reduced.

Acceptance Criteria:
- The screen exposes screen-specific automation parity improvements with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Minor

Risk Level:
- Low

