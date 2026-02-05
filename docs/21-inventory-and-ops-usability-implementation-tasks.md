# 21 - Inventory and Operations Usability Implementation Tasks

## Purpose

Translate `docs/20-inventory-and-ops-usability-user-stories.md` into execution-ready tasks.

## Board status definitions

- `Backlog`: defined but not implementation-ready
- `Ready`: acceptance + dependencies clear
- `In Progress`: actively being implemented
- `Review`: PR opened / waiting review
- `Done`: merged and validated
- `Blocked`: dependency unresolved

---

## Story-to-task breakdown

## US-IOU-001 - Auto SKU generation (Story 1.1)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `IOU-SKU-T01` | Define SKU format and collision strategy per organization | Backend | 0.5d | P0 | None | item domain docs + service comments | Backlog |
| `IOU-SKU-T02` | Implement server-side SKU generation when payload SKU is empty | Backend | 1d | P0 | T01 | items service + repo layer | Backlog |
| `IOU-SKU-T03` | Add uniqueness guard and retry on sequence collision | Backend | 0.5d | P0 | T02 | items service + DB constraints | Backlog |
| `IOU-SKU-T04` | Show generated SKU in item form with manual override support | Frontend | 0.5d | P1 | T02 | item create/edit UI | Backlog |
| `IOU-SKU-T05` | Add API + UI tests for blank-SKU auto generation path | QA | 0.75d | P1 | T03,T04 | api tests + web e2e | Backlog |

## US-IOU-002 - Reorder point with selected UOM (Story 1.2)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `IOU-UOM-T01` | Finalize conversion rules between selected UOM and base UOM | Backend | 0.5d | P0 | None | shared UOM helpers | Backlog |
| `IOU-UOM-T02` | Persist reorder point normalized to base unit | Backend | 0.75d | P0 | T01 | items service/schema paths | Backlog |
| `IOU-UOM-T03` | Display reorder point with selected/display UOM in UI | Frontend | 0.5d | P0 | T02 | item form and detail views | Backlog |
| `IOU-UOM-T04` | Add tests for conversion round-trip and precision edge cases | QA/Backend | 0.75d | P1 | T02,T03 | unit + integration tests | Backlog |

## US-IOU-003 - Opening quantity/value behavior (Story 1.3)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `IOU-OPEN-T01` | Define formula rules for qty/cost/value auto-compute (2-of-3 model) | Fullstack | 0.5d | P0 | None | docs + shared helper module | Backlog |
| `IOU-OPEN-T02` | Implement backend normalization + compute validation | Backend | 1d | P0 | T01 | item opening balance service logic | Backlog |
| `IOU-OPEN-T03` | Implement UI auto-calc interactions and manual override affordance | Frontend | 1d | P0 | T01 | item form state + field hints | Backlog |
| `IOU-OPEN-T04` | Add test matrix for calc paths and override behavior | QA | 0.75d | P1 | T02,T03 | api + web form tests | Backlog |

## US-IOU-004 - Wider line-item search selector (Story 2.1)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `IOU-LINE-T01` | Increase desktop combobox width and improve responsive fallback | Frontend | 0.5d | P1 | None | invoice/bill line-item UI styles | Backlog |
| `IOU-LINE-T02` | Enrich option row display (name + SKU + supporting meta) | Frontend | 0.5d | P1 | T01 | line-item selector component | Backlog |
| `IOU-LINE-T03` | Add visual regression checks for desktop/mobile layouts | QA | 0.5d | P2 | T01,T02 | web tests/screenshots | Backlog |

## US-IOU-005 - Expense paid-from account options (Story 2.2)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `IOU-EXP-T01` | Define allowed account-type filter for expense payment source | Backend | 0.5d | P0 | None | accounts/expenses domain rules | Backlog |
| `IOU-EXP-T02` | Update paid-from API query/filter to include all valid accounts | Backend | 0.75d | P0 | T01 | expenses service/query layer | Backlog |
| `IOU-EXP-T03` | Update expense UI dropdown with new filtered list and default | Frontend | 0.5d | P1 | T02 | expenses page/form state | Backlog |
| `IOU-EXP-T04` | Add tests for allowed/blocked account scenarios | QA | 0.5d | P1 | T02,T03 | API + UI tests | Backlog |

## US-IOU-006 - User-friendly journal mode (Story 2.3)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `IOU-JRN-T01` | Define plain-language journal mode UX and accountant mode toggle | Product/Frontend | 0.75d | P0 | None | journal UX spec + copy | Backlog |
| `IOU-JRN-T02` | Implement friendly labels and per-account helper guidance | Frontend | 1.25d | P0 | T01 | journal entry UI components | Backlog |
| `IOU-JRN-T03` | Keep backend posting model unchanged and enforce balanced entries | Backend | 0.5d | P0 | T01 | journal service validation | Backlog |
| `IOU-JRN-T04` | Add onboarding tooltips/examples for common entries | Frontend | 0.5d | P1 | T02 | journal helper UI | Backlog |
| `IOU-JRN-T05` | Add tests for mode switching and balance validation | QA | 0.75d | P1 | T02,T03 | journal UI + API tests | Backlog |

## US-IOU-007 - Progressive organization settings (Stories 3.1, 3.2)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `IOU-ORG-T01` | Define minimum required org fields vs optional profile fields | Product/Backend | 0.5d | P0 | None | org settings schema docs | Backlog |
| `IOU-ORG-T02` | Update backend validation to require only core fields | Backend | 0.75d | P0 | T01 | org settings validation/service | Backlog |
| `IOU-ORG-T03` | Update settings form labels and optional-field UX | Frontend | 0.75d | P0 | T01 | org settings page/form | Backlog |
| `IOU-ORG-T04` | Add setup completeness indicator and non-blocking prompts | Frontend | 0.75d | P1 | T03 | org settings + dashboard/home | Backlog |
| `IOU-ORG-T05` | Add tests for partial save and later completion path | QA | 0.75d | P1 | T02,T04 | API + web e2e | Backlog |

---

## Cross-story tasks

| Task ID | Task | Lane | Est. | Priority | Depends On | Status |
| --- | --- | --- | ---: | --- | --- | --- |
| `IOU-X-T01` | Update docs for SKU/UOM/opening rules and journal friendly mode | Fullstack | 0.75d | P0 | SKU,UOM,OPEN,JRN | Backlog |
| `IOU-X-T02` | Add smoke checks for item create, expense paid-from, and journal entry flows | QA | 1d | P1 | Major story tasks | Backlog |
| `IOU-X-T03` | Add migration/data patch notes if any schema change is introduced | Backend | 0.5d | P1 | story-dependent | Backlog |

## Suggested delivery order

1. `US-IOU-001`, `US-IOU-002`, `US-IOU-003`
2. `US-IOU-005`, `US-IOU-004`
3. `US-IOU-007`
4. `US-IOU-006`
5. Cross-story tasks and smoke verification

