# 13 - Sprint 1 Implementation Tasks (Branch: `sprint-1`)

## Sprint objective

Deliver Sprint 1 from `docs/12-sprint-board.md`:

- `US-P1-HARD-001` As-of-date inventory costing
- `US-P1-HARD-002` High-precision quantity in cost engine
- `US-P1-HARD-005` Negative stock policy control
- `US-P1-ONB-002` Invite lifecycle management
- `US-P1-ONB-001` Role-based onboarding checklist

## Board status definitions

- `Backlog`: defined but not implementation-ready
- `Ready`: acceptance + dependencies clear, can start
- `In Progress`: actively being implemented
- `Review`: PR opened / waiting review or QA
- `Done`: merged, tested, and feature flag state documented
- `Blocked`: dependency unresolved

---

## Story-to-Task breakdown

## US-P1-HARD-001 - As-of-date inventory costing

### Scope intent
Ensure inventory costing does not use future movements for backdated postings.

| Task ID | Task | Lane | Est. | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- |
| `S1-H001-T01` | Define costing policy for backdated docs (source date vs posting date) and document decision | Backend | 0.5d | None | `docs/13-sprint-1-implementation-tasks.md` | Done |
| `S1-H001-T02` | Extend cost resolver contract to accept effective date and org policy | Backend | 1d | T01 | `apps/api/src/common/inventory-cost.ts` | Review |
| `S1-H001-T03` | Pass effective date from invoice posting flow | Backend | 0.5d | T02 | `apps/api/src/modules/invoices/invoices.service.ts` | Review |
| `S1-H001-T04` | Pass effective date from credit note posting flow | Backend | 0.5d | T02 | `apps/api/src/modules/credit-notes/credit-notes.service.ts` | Review |
| `S1-H001-T05` | Add regression tests: backdated invoice/credit note with later purchase movements | QA/Backend | 1.5d | T03,T04 | `apps/api/src/common/*.spec.ts`, module specs | Review |
| `S1-H001-T06` | Add feature flag and rollout note for new costing behavior | Backend | 0.5d | T05 | env/config docs | Review |

**Policy decision (implemented in Sprint 1, slice 1):**

- Effective cost cut-off uses document-effective date (`invoiceDate` / `creditNoteDate`) passed into the inventory cost resolver.
- Movement effective date resolution currently uses:
  - `billDate` for `BILL` inbound movements
  - `creditNoteDate` for `CREDIT_NOTE` inbound movements
  - `voidedAt` for `INVOICE_VOID` inbound movements when available
  - fallback to movement `createdAt` for other/unknown movement sources
- This keeps backdated postings from using later-dated inbound cost sources in the common flows while remaining compatible with current schema.

**Rollout note (feature flag):**

- Flag name: `INVENTORY_COST_EFFECTIVE_DATE_ENABLED`
- Location: API env (`apps/api/src/common/env.ts`) and env examples (`.env*.example`)
- Default: `true`
- Emergency rollback: set flag to `false` and restart API to revert to pre-cutoff fallback behavior while investigating.

---

## US-P1-HARD-002 - High-precision quantity in cost engine

### Scope intent
Preserve quantity precision in costing math and round only monetary values.

| Task ID | Task | Lane | Est. | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- |
| `S1-H002-T01` | Define precision rule (qty >= 4dp, money 2dp) and helper strategy | Backend | 0.5d | None | `apps/api/src/common/money.ts`, docs | Done |
| `S1-H002-T02` | Refactor inventory cost accumulation to avoid 2dp qty rounding | Backend | 1d | T01 | `apps/api/src/common/inventory-cost.ts` | Review |
| `S1-H002-T03` | Add tests for fractional qty drift (multiple movements and mixed UOM) | QA/Backend | 1d | T02 | `apps/api/src/common/*.spec.ts` | Review |
| `S1-H002-T04` | Validate movement unit-cost derivation remains stable after precision changes | Backend | 0.5d | T02 | `apps/api/src/modules/bills/bills.service.ts` | Review |

**Precision rule (implemented in Sprint 1, slice 2):**

- Quantity math in inventory cost fallback uses 4 decimal places.
- Monetary amounts remain 2 decimal places.
- Fractional-quantity regression tests are added in `apps/api/src/common/inventory-cost.spec.ts`.
- Bill inventory movement quantity/unit-cost derivation is aligned to 4dp quantity precision in `apps/api/src/modules/bills/bills.service.ts` with helper tests in `apps/api/src/modules/bills/bills.service.spec.ts`.

---

## US-P1-HARD-005 - Negative stock policy control

### Scope intent
Support org-level policy: block / warn / allow when stock would go below zero.

| Task ID | Task | Lane | Est. | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- |
| `S1-H005-T01` | Add org setting model for negative stock policy and default | Backend | 1d | None | `apps/api/prisma/schema.prisma`, migration | Review |
| `S1-H005-T02` | Add policy validation helper for inventory issue actions | Backend | 1d | T01 | `apps/api/src/common/*`, `apps/api/src/modules/invoices/invoices.service.ts` | Review |
| `S1-H005-T03` | Enforce policy in invoice post and credit note void/invoice void flows where stock issues occur | Backend | 1d | T02 | `apps/api/src/modules/invoices/invoices.service.ts`, `apps/api/src/modules/credit-notes/credit-notes.service.ts` | Review |
| `S1-H005-T04` | Add warning UX for warn mode and override UX for authorized roles | Frontend | 1d | T03 | invoice/credit note pages, shared UI warning components | Review |
| `S1-H005-T05` | Add permission + audit trail on override action | Backend | 0.5d | T03 | rbac + audit service usage | Review |
| `S1-H005-T06` | Add tests for block/warn/allow + override paths | QA/Backend/Frontend | 1.5d | T04,T05 | api tests + web e2e | Review |

**Modeling note (implemented in Sprint 1, slice 3):**

- Added `NegativeStockPolicy` enum (`ALLOW`, `WARN`, `BLOCK`) in Prisma schema.
- Added `OrgSettings.negativeStockPolicy` with default `ALLOW`.
- Exposed `negativeStockPolicy` in shared org settings update schema for API payload validation.
- Added policy helper module (`normalize`, issue detection, block assertion) in `apps/api/src/common/negative-stock-policy.ts` with tests.
- Added backend enforcement in inventory issue paths:
  - invoice post (`INVOICE` stock issue)
  - credit note void (`CREDIT_NOTE_VOID` stock issue)
  - note: invoice void adds stock (`INVOICE_VOID`), so it does not trigger negative-stock blocking.
- Added frontend controls:
  - organization settings field for `negativeStockPolicy` (`ALLOW` / `WARN` / `BLOCK`)
  - invoice post dialog surfaces block/warn shortfall details and supports override action for authorized users.
- Added override control plane:
  - new permission `INVENTORY_NEGATIVE_STOCK_OVERRIDE`
  - invoice post and credit-note void accept optional override payload (`negativeStockOverride`, reason)
  - override attempts without permission are rejected (`403`)
  - successful override is included in POST/VOID audit payload and response warning metadata.
- Added regression coverage:
  - helper serialization test (`apps/api/src/common/negative-stock-policy.spec.ts`)
  - e2e policy behavior tests (`apps/api/test/inventory.tracking.e2e-spec.ts`) for block, warn, and block+override flows.

---

## US-P1-ONB-002 - Invite lifecycle management

### Scope intent
Add invite status lifecycle controls: resend/revoke/expiry visibility.

| Task ID | Task | Lane | Est. | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- |
| `S1-O002-T01` | Add invite lifecycle fields and status derivation (`revokedAt`, `lastSentAt`, `sendCount`) | Backend | 1d | None | `apps/api/prisma/schema.prisma`, migration | Review |
| `S1-O002-T02` | Add API endpoints: resend invite, revoke invite, list invites with status | Backend | 1.5d | T01 | `apps/api/src/modules/org-users/*` | Review |
| `S1-O002-T03` | Improve mailer template payload for resend context | Backend | 0.5d | T02 | `apps/api/src/common/mailer.service.ts` | Review |
| `S1-O002-T04` | Dashboard user-management UI: status chip, resend/revoke actions, expiry column | Frontend | 1.5d | T02 | `apps/web/src/features/dashboard/*` | Review |
| `S1-O002-T05` | Audit-log integration tests for resend/revoke actions | QA/Backend | 1d | T02 | org-users tests | Review |
| `S1-O002-T06` | UX copy pass for invitation errors/hints | Frontend | 0.5d | T04 | dashboard UI + shared error handling | Review |

**Lifecycle model note (implemented in Sprint 1, slice 4):**

- Added invite lifecycle columns in Prisma:
  - `Invite.revokedAt` (nullable timestamp)
  - `Invite.lastSentAt` (timestamp, default now)
  - `Invite.sendCount` (int, default 1)
- Added migration `apps/api/prisma/migrations/20260204180000_invite_lifecycle_fields/migration.sql`.
- Updated invite service behavior:
  - pending-invite conflict check excludes revoked invites
  - invite create persists initial send metadata (`lastSentAt`, `sendCount`)
  - invite create response now includes lifecycle metadata and derived status
  - accept flow now differentiates `revoked`, `accepted`, and `expired` outcomes explicitly.
- Added invite lifecycle APIs:
  - `GET /orgs/users/invites` list with derived status
  - `POST /orgs/users/invites/:id/resend` with optional expiry refresh
  - `POST /orgs/users/invites/:id/revoke` for lifecycle stop
  - all new actions support idempotency key handling and audit metadata.
- Updated mailer invite payload context for resend awareness:
  - supports org name, inviter email, role name, expiry date, and resend counter
  - subject/copy adapts for reminder vs initial invite.
- Added dashboard users tab invite lifecycle UI:
  - invite table with status chip, expiry date, last-sent date, and send count
  - row actions for resend/revoke wired to lifecycle APIs.
- Added invite lifecycle e2e coverage:
  - list/resend/revoke endpoint behavior in `apps/api/test/invites.email.e2e-spec.ts`
  - audit metadata assertions for `RESEND` and `REVOKE` events.
- Added invite UX copy polish:
  - users tab lifecycle hint text for resend/expiry behavior
  - actionable error copy for send/resend/revoke invite failures in dashboard state handling.

---

## US-P1-ONB-001 - Role-based onboarding checklist

### Scope intent
Guide new users by role through core setup milestones.

| Task ID | Task | Lane | Est. | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- |
| `S1-O001-T01` | Define checklist steps by role (owner/accountant/operator) and completion rules | Product/Fullstack | 0.5d | None | docs + constants | Ready |
| `S1-O001-T02` | Add persistence model for onboarding progress (per org + user/member) | Backend | 1d | T01 | Prisma schema + module | Backlog |
| `S1-O001-T03` | Create onboarding API (get progress, update step, mark complete) | Backend | 1d | T02 | new module or org/users module | Backlog |
| `S1-O001-T04` | Build onboarding checklist UI shell with progress state | Frontend | 1.5d | T03 | `apps/web/src/features/dashboard/*`, auth/protected home | Backlog |
| `S1-O001-T05` | Hook checklist completion to existing setup flows (org create, bank/tax setup, first transaction marker) | Fullstack | 1.5d | T04 | dashboard + related pages | Backlog |
| `S1-O001-T06` | Add tests for role-based visibility and progress persistence | QA/Fullstack | 1.5d | T05 | web e2e + api tests | Backlog |

---

## Cross-story engineering tasks (Sprint 1)

| Task ID | Task | Lane | Est. | Depends On | Status |
| --- | --- | --- | ---: | --- | --- |
| `S1-X-T01` | Feature flag registry entries for all Sprint 1 stories | Backend | 0.5d | None | Backlog |
| `S1-X-T02` | Update API docs / internal docs for new settings and endpoints | Backend | 0.5d | Story tasks merged | Backlog |
| `S1-X-T03` | End-to-end smoke suite for Sprint 1 acceptance flows | QA | 1d | Major story tasks merged | Backlog |
| `S1-X-T04` | Release checklist for staged rollout and rollback by feature flag | Fullstack | 0.5d | X-T01 | Backlog |

---

## Suggested execution sequence (within Sprint 1)

### Week 1

1. `US-P1-HARD-001` (`S1-H001-*`) and `US-P1-HARD-002` (`S1-H002-*`)
2. `US-P1-HARD-005` backend core (`S1-H005-T01..T03`)
3. `US-P1-ONB-002` backend lifecycle (`S1-O002-T01..T03`)

### Week 2

1. `US-P1-HARD-005` frontend/QA (`S1-H005-T04..T06`)
2. `US-P1-ONB-002` frontend/QA (`S1-O002-T04..T06`)
3. `US-P1-ONB-001` full flow (`S1-O001-*`)
4. Cross-story hardening (`S1-X-*`)

---

## PR slicing plan

- **PR-1:** Costing effective date + precision (`US-P1-HARD-001`, `US-P1-HARD-002`)
- **PR-2:** Negative stock policy backend + feature flag
- **PR-3:** Negative stock UI + override + tests
- **PR-4:** Invite lifecycle backend
- **PR-5:** Invite lifecycle UI + tests
- **PR-6:** Role-based onboarding persistence + API
- **PR-7:** Role-based onboarding UI + progress integration
- **PR-8:** Sprint 1 final QA/e2e + docs/release checklist

---

## Risks and immediate mitigations

- **Migration risk:** group schema changes early in week 1 and freeze schema after mid-sprint.
- **Scope risk:** if onboarding checklist overruns, ship read-only checklist first, then write-back completion in follow-up patch.
- **QA risk:** reserve last 2 days for cross-story regression, especially inventory + aging consistency.
