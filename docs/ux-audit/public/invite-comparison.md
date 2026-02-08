# Screen Name: Invite

## 1. Current LedgerLite Capabilities
- Route: `/invite`
- Screen file: `apps/web/app/invite/page.tsx`
- Permission checks in UI: none detected in route-level scan
- API endpoints referenced directly: `/orgs/users/invite/accept`
- HTTP methods referenced from this screen: `POST`
- UI capabilities detected: filterRow=False, savedViews=False, statusChip=False, form=True, fieldArray=False, lockDateWarning=False, attachments=False, dialog=False
- Workflow signals: create/post actions detected

## 2. Zoho Books Capabilities
- Guided signup and invite acceptance with strong auth guardrails.
- Organization-aware onboarding that avoids entering operational screens too early.
- Clear account lifecycle prompts (verification, resets, access).

## 3. Feature Gap Analysis
| Feature | Exists in LedgerLite | Exists in Zoho | Gap Type | Impact | Priority |
|---------|----------------------|---------------|----------|--------|----------|
| Progressive onboarding guidance before first accounting transaction | Partial | Yes | UX Deficiency | Medium | 36 |
| Self-serve credential recovery and verification resend prompts | Partial | Yes | Workflow Limitation | Medium | 36 |

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
### ID: UX-PUBLIC-01

As a new organization user,
I want progressive onboarding guidance before first accounting transaction,
So that the process is more reliable and efficient.

Acceptance Criteria:
- The screen exposes progressive onboarding guidance before first accounting transaction with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- None

Risk Level:
- Medium

### ID: UX-PUBLIC-02

As a new organization user,
I want self-serve credential recovery and verification resend prompts,
So that the process is more reliable and efficient.

Acceptance Criteria:
- The screen exposes self-serve credential recovery and verification resend prompts with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Minor

Risk Level:
- Medium

