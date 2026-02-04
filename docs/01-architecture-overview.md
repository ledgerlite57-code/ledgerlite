# 01 - Architecture Overview

## System at a glance

LedgerLite is a monorepo modular monolith with a separate web frontend:

```text
Browser (Next.js web app)
        |
        | HTTPS (cookies + bearer)
        v
NestJS API (modules by domain)
        |
        | Prisma
        v
PostgreSQL
```

Shared contracts (`@ledgerlite/shared`) are consumed by both API and Web for schema validation, permissions, and error/envelope typing.

## High-level component boundaries

### Web (`apps/web`)

- Next.js App Router app with public routes (`/`, `/login`, `/signup`, `/invite`) and protected route group (`/(protected)`)
- Protected layout bootstraps session/permissions and renders permission-aware navigation
- Pages call API through a shared `apiFetch` client that handles access token refresh and envelope parsing

### API (`apps/api`)

- NestJS `AppModule` composes domain modules (`accounts`, `invoices`, `bills`, `reports`, `pdc`, etc.)
- Global infrastructure:
  - request context middleware (`requestId`, `userId`, `orgId`, IP, user-agent)
  - pino HTTP logging middleware
  - global error filter (standardized error envelope)
  - global response interceptor (standardized success envelope)
  - global throttling guard
- Prisma service is shared across modules

### Database (`PostgreSQL + Prisma`)

- One logical database
- Multi-tenant tables scoped by `orgId`
- Ledger-centric domain with GL headers/lines, source documents, allocations, reconciliation, and audit trail

## API <-> Web <-> DB interaction flow

1. Web signs in (`/auth/login`) and stores access token in session storage.
2. API sets refresh and CSRF cookies on `/auth` path.
3. Protected page calls API with bearer token.
4. API `JwtAuthGuard` verifies JWT and stores `userId/orgId` in request context.
5. `RbacGuard` checks required permissions against role permissions for active membership.
6. Service executes Prisma queries scoped by `orgId`.
7. Response interceptor wraps successful response as `{ ok: true, data, requestId }`.
8. Errors are normalized by global filter as `{ ok: false, error, requestId }`.

## Module boundaries and responsibilities

### Platform/core

- `auth`: login/register/refresh/logout/me, refresh-token lifecycle
- `rbac`: permission decorators + guard enforcement
- `prisma`: DB connectivity + lifecycle
- `common`: audit service, mailer, idempotency hashing, lock-date/currency/GL invariants
- `logging`: request context + HTTP logging

### Master data

- `orgs`, `org-users` (org setup, settings, roles, invites/memberships)
- `accounts`, `tax-codes`, `customers`, `vendors`, `items`, `units-of-measurement`, `bank-accounts`

### Transactional/accounting domains

- `invoices`, `credit-notes`, `payments-received`
- `bills`, `expenses`, `vendor-payments`
- `pdc` (post-dated cheque lifecycle)
- `journals`
- `bank-transactions` import
- `reconciliation-sessions`
- `reports` and `dashboard`
- `attachments`, `saved-views`, `audit-logs`

## Multi-tenancy approach (as implemented)

- Tenant context is organization-based (`orgId`).
- Access tokens may include `orgId`, `membershipId`, `roleId`.
- Guards enforce active membership and permission checks per request.
- Service/repository queries are consistently constrained by `orgId`.
- Schema uses tenant-scoped uniqueness (for example, account code uniqueness by org, document number uniqueness by org).

## Auth and request lifecycle

### Authentication model

- Access token: JWT in bearer header for protected API calls.
- Refresh token: httpOnly cookie (`refresh_token`), rotated on refresh.
- CSRF token: non-httpOnly cookie (`csrf_token`) validated for cookie-based refresh/logout.

### Request lifecycle (backend)

- Middleware stack in `main.ts`: cookie parsing -> request context -> HTTP logger -> helmet -> CORS
- Global guards/interceptors/filters handle throttling, authz, response envelope, and error envelope
- Sentry capture is integrated for unhandled and filtered exceptions

## Accounting lifecycle pattern (cross-cutting)

Across invoice/bill/expense/payment/journal/credit-note/PDC modules, the implementation repeatedly applies:

- Draft -> post -> void/bounce status transitions
- Idempotency key checks for create/post/void-like mutations
- Lock-date enforcement before posting/voiding
- Base-currency-only posting enforcement
- Double-entry GL posting with balance invariants
- GL reversals for void/bounce actions
- Audit log writes for create/update/post/void flows
