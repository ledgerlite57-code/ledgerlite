# 16 - Sprint 1 Release Checklist

## Purpose

Define a staged rollout and rollback checklist for Sprint 1 stories using environment feature flags.

Related infrastructure runbook:
- `docs/17-domains-env-isolation-and-cicd-runbook.md`

## Sprint 1 feature flags

| Flag | Story scope | Default |
| --- | --- | --- |
| `INVENTORY_COST_EFFECTIVE_DATE_ENABLED` | `US-P1-HARD-001` as-of-date inventory costing | `true` |
| `INVENTORY_COST_HIGH_PRECISION_QTY_ENABLED` | `US-P1-HARD-002` high-precision quantity | `true` |
| `NEGATIVE_STOCK_POLICY_ENABLED` | `US-P1-HARD-005` negative stock policy controls | `true` |
| `INVITE_LIFECYCLE_ENABLED` | `US-P1-ONB-002` invite lifecycle | `true` |
| `ONBOARDING_CHECKLIST_ENABLED` | `US-P1-ONB-001` onboarding checklist | `true` |

## Pre-deploy checklist

- Confirm migrations are up to date and include:
  - `20260204180000_invite_lifecycle_fields`
  - `20260204191000_onboarding_progress`
- Confirm env files contain all Sprint 1 flags for target environment.
- Run Sprint 1 smoke validation:
  - `pnpm test:sprint1:smoke`
- Confirm docs updated:
  - `docs/13-sprint-1-implementation-tasks.md`
  - `docs/15-sprint-1-smoke-suite.md`

## Staged rollout sequence

### Stage 1 (development)

- Deploy `dev` branch.
- Validate smoke suite and manual sanity checks:
  - invoice/bill post with inventory items
  - negative stock block/warn behavior
  - invite resend/revoke lifecycle
  - onboarding checklist load/update/complete

### Stage 2 (staging)

- Deploy `staging` branch.
- Re-run smoke suite against staging DB snapshot.
- Verify release notes with QA signoff.

### Stage 3 (production)

- Deploy `main` branch.
- Run post-deploy checks for:
  - dashboard load
  - document posting flow
  - invite flow
  - onboarding overview panel

## Rollback playbook

### Immediate mitigation (no rollback deployment)

- Set affected feature flag(s) to `false` in environment config.
- Restart API service.
- Re-test impacted flow quickly.

### Flag-by-flag rollback mapping

| Incident symptom | Disable first |
| --- | --- |
| Backdated inventory valuation anomalies | `INVENTORY_COST_EFFECTIVE_DATE_ENABLED` |
| Fractional quantity valuation drift | `INVENTORY_COST_HIGH_PRECISION_QTY_ENABLED` |
| Posting blocked/overridden unexpectedly by stock policy | `NEGATIVE_STOCK_POLICY_ENABLED` |
| Invite resend/revoke/status regressions | `INVITE_LIFECYCLE_ENABLED` |
| Onboarding checklist load/update regressions | `ONBOARDING_CHECKLIST_ENABLED` |

### Full deployment rollback (if needed)

- Re-deploy previous stable commit for target environment.
- Keep migrations in place (do not down-migrate in production hotfix path).
- Keep non-impacted flags enabled; disable only impacted story flags first.

## Signoff checklist

- Engineering signoff (API + Web)
- QA signoff (smoke + targeted regression)
- Product signoff (onboarding/invite UX acceptance)
- Deployment log and rollback notes recorded in release ticket
