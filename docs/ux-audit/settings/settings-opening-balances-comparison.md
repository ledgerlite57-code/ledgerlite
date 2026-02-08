# Screen Name: Settings Opening Balances

## 1. Current LedgerLite Capabilities
- Route: `/settings/opening-balances`
- Screen file: `apps/web/app/(protected)/settings/opening-balances/page.tsx`
- Permission checks in UI: `ORG_WRITE`
- API endpoints referenced directly: `/accounts`, `/items?isActive=true&pageSize=100`, `/settings/opening-balances/cut-over`, `/settings/opening-balances/draft-lines`, `/settings/opening-balances/inventory`, `/settings/opening-balances/post`, `/settings/opening-balances/preview`, `/settings/opening-balances/status`
- HTTP methods referenced from this screen: `PATCH`, `POST`, `PUT`
- UI capabilities detected: filterRow=False, savedViews=False, statusChip=True, form=False, fieldArray=False, lockDateWarning=False, attachments=False, dialog=True
- Workflow signals: create/post actions detected; update actions detected

## 2. Zoho Books Capabilities
- Transaction locking and audit-oriented controls.
- Configurable accounting preferences and taxes.
- Admin-focused guardrails for organization-level controls.
- Zoho-style migration flows rely on cut-over and opening values with accounting validation.

## 3. Feature Gap Analysis
| Feature | Exists in LedgerLite | Exists in Zoho | Gap Type | Impact | Priority |
|---------|----------------------|---------------|----------|--------|----------|
| Visible period-lock warning at point of edit/post | No | Yes | Compliance Risk | Critical | 75 |
| Posted-state immutability cues in UI | Not Evident | Yes | Compliance Risk | Critical | 75 |
| Inline filter bar for day-to-day segmentation | No | Yes | UX Deficiency | High | 60 |
| Cut-over integrity checklist (lock date + approval + final preview signoff) | Partial | Yes | Compliance Risk | Critical | 50 |
| Optimistic concurrency guard for multi-user edits | Not Evident | Yes | Performance Risk | High | 48 |
| Native attachment handling on transaction screen | No | Yes | Missing Feature | High | 48 |
| Saved views with reusable list criteria | No | Yes | Workflow Limitation | Medium | 45 |
| Import template validation assistant before draft commit | Partial | Yes | Automation Missing | High | 40 |
| Direct audit trail jump from transaction details | Partial | Yes | Workflow Limitation | Medium | 36 |

Scoring model used:
- Impact Weight: Critical=5, High=4, Medium=3, Low=2
- Frequency Weight: Daily use=5, Weekly=4, Monthly=3, Rare=2
- Revenue Relevance: Directly impacts billing/cashflow=5, Indirectly impacts efficiency=3, Cosmetic=1
- Priority = Impact Weight x Frequency Weight x Revenue Relevance

## Accounting Integrity Risks
- Edit after posting: Potential risk. Edit/delete actions are present in this screen scan; posted-state immutability is not explicitly confirmed here.
- Period locking: Potential risk. No lock-date warning affordance detected in this screen.
- Audit logs: Global audit page exists, but direct linkage from this screen is not evident.
- Multi-user conflicts: Potential risk. No optimistic concurrency indicator detected from route-level scan.
- Journal imbalance risk: Potential risk unless backend posting checks block imbalance consistently; UI-level balance cues vary by screen.
- Soft deletes: No delete action detected on this screen.

## 4. Recommended User Stories (Ordered by Priority)
### ID: UX-SETTINGS-01

As a finance admin,
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

### ID: UX-SETTINGS-02

As a finance admin,
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

### ID: UX-SETTINGS-03

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

### ID: UX-SETTINGS-04

As a finance admin,
I want cut-over integrity checklist (lock date + approval + final preview signoff),
So that books remain accurate and audit-ready.

Acceptance Criteria:
- The screen exposes cut-over integrity checklist (lock date + approval + final preview signoff) with clear validation and error states.
- Behavior is consistent with existing permissions and organization scoping.
- Behavior is covered by automated tests for happy path and guardrail path.

Backend Impact:
- Major

Risk Level:
- High

### ID: UX-SETTINGS-05

As a finance admin,
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

### ID: UX-SETTINGS-06

As a finance admin,
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

