You are working on LedgerLite v1.0 (FROZEN spec). You MUST follow these documents as the source of truth:

- README.md (tech stack & tooling)
- docs/BRD.md (business requirements)
- docs/ARCHITECTURE_DIAGRAM.md (system & module architecture)
- docs/TECH_ARCHITECTURE.md (stack decisions)
- docs/DB_SCHEMA.md (database schema & constraints)
- docs/DESIGN_SYSTEM.md (UI/UX rules)
- docs/USER_STORIES.md (user stories)
- docs/MAPPING.md (story → UI/API/DB/ledger/tests)
- docs/PHASE_PLAN.md (vertical slice execution)
- docs/TESTING_CHECKLIST.md (verification rules)

Hard rules:
1) Never modify posted accounting data; use reversal/void patterns only.
2) All totals, VAT, and balances are computed server-side.
3) Posting endpoints MUST be transactional, idempotent, and audited.
4) Every write endpoint MUST have Zod validation and RBAC enforcement.
5) Every story MUST include DB, API, UI, tests, and audit logs.

Output rules:
- First output an implementation plan (files & steps).
- Then generate code.
- Then list tests to run.
- Then list manual verification steps.
- If assumptions are required, document them in a CHANGELOG section.





Implement PHASE 0 from docs/PHASE_PLAN.md as a complete vertical slice.

Scope:
- User stories: (platform foundation scope; no story IDs)

Deliverables:
1) Prisma schema + migrations (as needed)
2) Seed updates (if needed)
3) NestJS auth, RBAC, logging, health
4) Next.js scaffolding
5) Observability wiring
6) Tests: unit, integration, Playwright e2e
7) Documentation updates (docs/MAPPING.md if needed)

Acceptance:
- Must satisfy docs/TESTING_CHECKLIST.md Phase 0.
- Provide commands to run locally and in CI.




Implement PHASE 1 from docs/PHASE_PLAN.md as a complete vertical slice.

Scope:
- User stories: US-ORG-01, US-COA-01, US-AUTH-01

Deliverables:
1) Prisma schema + migrations
2) Seed updates (roles, permissions, accounts)
3) NestJS modules, controllers, services, Zod schemas, RBAC guards
4) Next.js UI following docs/DESIGN_SYSTEM.md
5) Audit logs for all state changes
6) Idempotency for create endpoints
7) Tests: unit, integration, Playwright e2e
8) Documentation updates (docs/MAPPING.md if needed)

Acceptance:
- Must satisfy docs/TESTING_CHECKLIST.md Phase 1.
- Provide commands to run locally and in CI.





Implement PHASE 2 from docs/PHASE_PLAN.md as a complete vertical slice.

Scope:
- User stories: US-CUST-01, US-VEND-01, US-ITEM-01, US-TAX-01

Deliverables:
1) Prisma schema + migrations
2) Seed updates (if needed)
3) NestJS modules, controllers, services, Zod schemas, RBAC guards
4) Next.js UI following docs/DESIGN_SYSTEM.md
5) Audit logs for all state changes
6) Idempotency for create endpoints
7) Tests: unit, integration, Playwright e2e
8) Documentation updates (docs/MAPPING.md if needed)

Acceptance:
- Must satisfy docs/TESTING_CHECKLIST.md Phase 2.
- Provide commands to run locally and in CI.






Implement PHASE 3 from docs/PHASE_PLAN.md as a complete vertical slice.

Scope:
- User stories: US-SALES-01, US-SALES-01b

Deliverables:
1) Prisma schema + migrations
2) Seed updates (org_settings numbering)
3) NestJS modules, controllers, services, Zod schemas, RBAC guards
4) Next.js UI following docs/DESIGN_SYSTEM.md
5) Ledger posting logic for invoices
6) Audit logs for all state changes
7) Idempotency for create/post endpoints
8) Tests: unit, integration, Playwright e2e
9) Documentation updates (docs/MAPPING.md if needed)

Imprvements needed
revisit the design and improve the components
button color should be some dark color
in the end after you do all , review the code and suggest if improvements needed in any area 


Acceptance:
- Must satisfy docs/TESTING_CHECKLIST.md Phase 3.
- Provide commands to run locally 






Implement PHASE 4 from docs/PHASE_PLAN.md as a complete vertical slice.

Scope:
- User stories: US-SALES-02, US-SALES-02b

Deliverables:
1) Prisma schema + migrations
2) Seed updates (if needed)
3) NestJS modules, controllers, services, Zod schemas, RBAC guards
4) Next.js UI following docs/DESIGN_SYSTEM.md
5) Ledger posting logic for payments received
6) Audit logs for all state changes
7) Idempotency for create/post endpoints
8) Tests: unit, integration, Playwright e2e
9) Documentation updates (docs/MAPPING.md if needed)

Acceptance:
- Must satisfy docs/TESTING_CHECKLIST.md Phase 4.
- Provide commands to run locally and in CI.




+

Implement PHASE 5 from docs/PHASE_PLAN.md as a complete vertical slice.

Scope:
- User stories: US-PUR-01, US-PUR-01b

Deliverables:
1) Prisma schema + migrations
2) Seed updates (if needed)
3) NestJS modules, controllers, services, Zod schemas, RBAC guards
4) Next.js UI following docs/DESIGN_SYSTEM.md
5) Ledger posting logic for bills
6) Audit logs for all state changes
7) Idempotency for create/post endpoints
8) Tests: unit, integration, Playwright e2e
9) Documentation updates (docs/MAPPING.md if needed)

Acceptance:
- Must satisfy docs/TESTING_CHECKLIST.md Phase 5.
- Provide commands to run locally and in CI.




Implement PHASE 6 from docs/PHASE_PLAN.md as a complete vertical slice.

Scope:
- User stories: US-PUR-02, US-PUR-02b

Deliverables:
1) Prisma schema + migrations
2) Seed updates (if needed)
3) NestJS modules, controllers, services, Zod schemas, RBAC guards
4) Next.js UI following docs/DESIGN_SYSTEM.md
5) Ledger posting logic for vendor payments
6) Audit logs for all state changes
7) Idempotency for create/post endpoints
8) Tests: unit, integration, Playwright e2e
9) Documentation updates (docs/MAPPING.md if needed)

Acceptance:
- Must satisfy docs/TESTING_CHECKLIST.md Phase 6.
- Provide commands to run locally and in CI.




Implement PHASE 7 from docs/PHASE_PLAN.md as a complete vertical slice.

Scope:
- User stories: US-GL-01

Deliverables:
1) Prisma schema + migrations
2) Seed updates (if needed)
3) NestJS modules, controllers, services, Zod schemas, RBAC guards
4) Next.js UI following docs/DESIGN_SYSTEM.md
5) Ledger posting logic for journals
6) Audit logs for all state changes
7) Idempotency for create/post endpoints
8) Tests: unit, integration, Playwright e2e
9) Documentation updates (docs/MAPPING.md if needed)

Acceptance:
- Must satisfy docs/TESTING_CHECKLIST.md Phase 7.
- Provide commands to run locally and in CI.




Implement PHASE 8 from docs/PHASE_PLAN.md as a complete vertical slice.

Scope:
- User stories: US-BANK-01, US-BANK-02, US-BANK-03

Deliverables:
1) Prisma schema + migrations
2) Seed updates (if needed)
3) NestJS modules, controllers, services, Zod schemas, RBAC guards
4) Next.js UI following docs/DESIGN_SYSTEM.md
5) Audit logs for all state changes
6) Tests: unit, integration, Playwright e2e
7) Documentation updates (docs/MAPPING.md if needed)

Acceptance:
- Must satisfy docs/TESTING_CHECKLIST.md Phase 8.
- Provide commands to run locally and in CI.



Implement PHASE 9 from docs/PHASE_PLAN.md as a complete vertical slice.

Scope:
- User stories: US-REP-01, US-REP-02, US-REP-03, US-REP-04, US-REP-05, US-AUD-01

Deliverables:
1) Prisma schema + migrations (if needed)
2) Seed updates (if needed)
3) NestJS report endpoints with RBAC
4) Next.js report screens following docs/DESIGN_SYSTEM.md
5) Audit log screen + filters
6) Tests: unit, integration, Playwright e2e
7) Documentation updates (docs/MAPPING.md if needed)

Acceptance:
- Must satisfy docs/TESTING_CHECKLIST.md Phase 9.
- Provide commands to run locally and in CI.





Implement PHASE 10 from docs/PHASE_PLAN.md as a complete vertical slice.

Scope:
- User stories: US-DOC-01

Deliverables:
1) Prisma schema + migrations
2) Storage service + pre-signed URL flow
3) NestJS endpoints with RBAC + audit logs
4) Next.js attachments UI following docs/DESIGN_SYSTEM.md
5) Background PDF generation (BullMQ + Playwright)
6) Tests: unit, integration, Playwright e2e
7) Documentation updates (docs/MAPPING.md if needed)

Acceptance:
- Must satisfy docs/TESTING_CHECKLIST.md Phase 10.
- Provide commands to run locally and in CI.











