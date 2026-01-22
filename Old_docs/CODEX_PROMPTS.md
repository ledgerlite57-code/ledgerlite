# LedgerLite – Codex Prompt Templates (v1.0)

This document contains **copy–paste ready Codex prompts** to implement LedgerLite deterministically.
Using these templates ensures **no missed requirements**, full vertical slices, and accounting safety.

> **Version:** v1.0  
> **Status:** FROZEN  
> **Audience:** Engineering, Codex

---

## 0. One-Time Project Rules Prompt (MANDATORY)

Paste this at the **start of every Codex session**.

```text
You are working on LedgerLite v1.0 (FROZEN spec). You MUST follow these documents as the source of truth:

- README.md (tech stack & tooling)
- BRD.md (business requirements)
- ARCHITECTURE.md (system & module architecture)
- DB_SCHEMA.md (database schema & constraints)
- DESIGN_SYSTEM.md (UI/UX rules)
- USER_STORIES.md (user stories)
- MAPPING.md (story → UI/API/DB/ledger/tests)
- PHASE_PLAN.md (vertical slice execution)
- TESTING_CHECKLIST.md (verification rules)

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
```

---

## 1. Phase Execution Template (Vertical Slice)

```text
Implement PHASE <X> from PHASE_PLAN.md as a complete vertical slice.

Scope:
- User stories: <paste story IDs>

Deliverables:
1) Prisma schema + migrations
2) Seed updates (if needed)
3) NestJS modules, controllers, services, Zod schemas, RBAC guards
4) Next.js UI following DESIGN_SYSTEM.md
5) Ledger posting logic (if applicable)
6) Audit logs for all state changes
7) Idempotency for create/post endpoints
8) Tests: unit, integration, Playwright e2e
9) Documentation updates (MAPPING.md if needed)

Acceptance:
- Must satisfy TESTING_CHECKLIST.md for this phase.
- Provide commands to run locally and in CI.
```

---

## 2. Single User Story Template (Most Common)

```text
Implement user story <US-XXXX-YY> (<title>).

Use MAPPING.md to include:
- Screens
- UI components
- API endpoints
- DB tables
- Ledger postings (if applicable)
- Tests

Requirements:
- Follow DESIGN_SYSTEM.md
- Zod validation for all inputs
- RBAC enforced in API and UI
- Audit logs for create/update/post/void
- Posting: transaction + locks + idempotency + unique posting guard

Deliverables:
1) DB changes (Prisma + migration)
2) API endpoints + services
3) UI screens/components
4) Tests (unit + integration + e2e)
5) Documentation updates if required
```

---

## 3. Posting Endpoint Template (Invoices, Bills, Payments, Journals)

```text
Implement posting operation for <document type>.

Hard requirements:
- Atomic DB transaction
- UNIQUE(orgId, sourceType, sourceId) enforced
- Row locks FOR UPDATE
- Server-side totals validation
- Idempotency-Key support
- Ledger preview payload
- Audit logging

Tests:
- Happy path
- Double-post prevention
- Idempotency retry
- Rollback on failure
- Concurrency simulation
```

---

## 4. UI Screen Template

```text
Build UI for <module/screen>.

Rules:
- Header: title + single primary action
- Filters row
- TanStack Table with numeric alignment
- Create/Edit via Sheet
- Dangerous actions via Dialog
- Posted documents read-only

Deliverables:
- Pages & components
- react-hook-form + Zod validation
- API integration (TanStack Query)
- Permission-based rendering
- Component + e2e tests
```

---

## 5. Prisma & DB Constraints Template

```text
Update Prisma schema for <tables>.

Rules:
- UUID PKs, timestamptz timestamps
- Decimal for money
- Enforce UNIQUE & FK constraints
- Soft delete for master data
- Restrict deletes for ledger-linked tables

Deliverables:
- schema.prisma changes
- migration output
- constraint rationale
- integration tests
```

---

## 6. Testing Template

```text
Generate tests for <story/module>.

Include:
- Unit tests (calculations, validators)
- Integration tests (API + Postgres)
- E2E tests (Playwright)

Verify:
- RBAC enforcement
- Audit logs written
- Idempotency behavior
- Ledger balances
```

---

## 7. Attachments & Storage Template

```text
Implement attachments for <entity>.

Rules:
- S3/R2/MinIO compatible storage
- DB stores metadata only
- Pre-signed upload/download URLs
- Permission checks
- Draft-only delete rules

Deliverables:
- Storage service
- API endpoints
- UI attachment panel
- Tests
```

---

## 8. Release Gate Template

```text
Run release gate for <phase>.

Checklist:
- All tests passing
- Migrations applied on fresh DB
- Audit logs verified
- Idempotency verified
- Trial Balance balanced

Output:
- Results summary
- Go/No-Go decision
```

---

This document is the **Codex execution contract** for LedgerLite v1.0.
