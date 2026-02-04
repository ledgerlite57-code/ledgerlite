# 15 - Sprint 1 Smoke Suite

## Purpose

Provide a focused smoke run that validates the core Sprint 1 acceptance flows with a single command.

## Command

From repo root:

```bash
pnpm test:sprint1:smoke
```

Direct API package command:

```bash
pnpm --filter @ledgerlite/api test:sprint1:smoke
```

## Included test targets

The smoke command runs these tests in-band:

- `apps/api/test/inventory.tracking.e2e-spec.ts`
- `apps/api/test/invites.email.e2e-spec.ts`
- `apps/api/test/onboarding.e2e-spec.ts`
- `apps/api/src/common/inventory-cost.spec.ts`
- `apps/api/src/modules/bills/bills.service.spec.ts`

## Story coverage mapping

| Sprint 1 story | Primary smoke coverage |
| --- | --- |
| `US-P1-HARD-001` As-of-date inventory costing | `apps/api/src/common/inventory-cost.spec.ts` |
| `US-P1-HARD-002` High-precision quantity | `apps/api/src/common/inventory-cost.spec.ts`, `apps/api/src/modules/bills/bills.service.spec.ts` |
| `US-P1-HARD-005` Negative stock policy | `apps/api/test/inventory.tracking.e2e-spec.ts` |
| `US-P1-ONB-002` Invite lifecycle | `apps/api/test/invites.email.e2e-spec.ts` |
| `US-P1-ONB-001` Role-based onboarding checklist | `apps/api/test/onboarding.e2e-spec.ts` |

## Notes

- The suite intentionally blends API e2e and targeted domain specs for faster validation of Sprint 1 behavior.
- This smoke suite is not a full regression replacement; run full `pnpm test` and `pnpm test:e2e` before release.
