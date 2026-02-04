# 04 - Backend API

## Backend structure

- Entrypoint: `apps/api/src/main.ts`
- Root module: `apps/api/src/app.module.ts`
- Pattern: feature modules under `apps/api/src/modules/*`
- Shared infrastructure: `auth`, `rbac`, `prisma`, `common`, `logging`

## Request pipeline

Configured in `main.ts`:

1. cookie parser
2. request context middleware (`x-request-id`, user/org context store)
3. pino HTTP logger middleware (with auth/password redaction)
4. `helmet()`
5. global error filter (`HttpErrorFilter`)
6. global response interceptor (`ResponseInterceptor`)
7. CORS with credentials (`API_CORS_ORIGIN`)
8. global throttler guard (`ttl: 60`, `limit: 100`)

Swagger docs are enabled in non-production at `/docs`.

## Route groups by domain

## Auth and health

- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /health`
- `GET /health/protected`
- `GET /health/sentry-test` (non-prod behavior)

## Organization and users

- `POST /orgs`
- `GET /orgs/current`
- `GET /orgs/sidebar-counts`
- `PATCH /orgs/current`
- `PATCH /orgs/settings`
- `GET /orgs/roles`
- `GET /orgs/users`
- `POST /orgs/users/invite`
- `POST /orgs/users/invite/accept`
- `PATCH /orgs/users/:id`

## Master data

- Accounts: `GET /accounts`, `POST /accounts`, `PATCH /accounts/:id`
- Tax codes: `GET /tax-codes`, `GET /tax-codes/:id`, `POST /tax-codes`, `PATCH /tax-codes/:id`
- Customers: `GET /customers`, `GET /customers/:id`, `POST /customers`, `PATCH /customers/:id`
- Vendors: `GET /vendors`, `GET /vendors/:id`, `POST /vendors`, `PATCH /vendors/:id`
- Items: `GET /items`, `GET /items/:id`, `POST /items`, `PATCH /items/:id`
- Units: `GET /units-of-measurement`, `GET /units-of-measurement/:id`, `POST /units-of-measurement`, `PATCH /units-of-measurement/:id`
- Bank accounts: `GET /bank-accounts`, `POST /bank-accounts`, `PATCH /bank-accounts/:id`
- Bank import: `POST /bank-transactions/import`

## Transactional documents

- Invoices: `GET /invoices`, `GET /invoices/:id`, `POST /invoices`, `PATCH /invoices/:id`, `POST /invoices/:id/post`, `POST /invoices/:id/void`
- Credit notes: `GET /credit-notes`, `GET /credit-notes/:id`, `POST /credit-notes`, `PATCH /credit-notes/:id`, `POST /credit-notes/:id/post`, `POST /credit-notes/:id/void`
- Payments received: `GET /payments-received`, `GET /payments-received/:id`, `POST /payments-received`, `PATCH /payments-received/:id`, `POST /payments-received/:id/post`, `POST /payments-received/:id/void`
- Bills: `GET /bills`, `GET /bills/:id`, `POST /bills`, `PATCH /bills/:id`, `POST /bills/:id/post`, `POST /bills/:id/void`
- Expenses: `GET /expenses`, `GET /expenses/:id`, `POST /expenses`, `PATCH /expenses/:id`, `POST /expenses/:id/post`, `POST /expenses/:id/void`
- Vendor payments: `GET /vendor-payments`, `GET /vendor-payments/:id`, `POST /vendor-payments`, `PATCH /vendor-payments/:id`, `POST /vendor-payments/:id/post`, `POST /vendor-payments/:id/void`
- Journals: `GET /journals`, `GET /journals/:id`, `POST /journals`, `PATCH /journals/:id`, `POST /journals/:id/post`, `POST /journals/:id/void`
- PDC: `GET /pdc`, `GET /pdc/:id`, `POST /pdc`, `PATCH /pdc/:id`, `POST /pdc/:id/schedule`, `POST /pdc/:id/deposit`, `POST /pdc/:id/clear`, `POST /pdc/:id/bounce`, `POST /pdc/:id/cancel`

## Reconciliation, reports, and support

- Reconciliation sessions:
  - `GET /reconciliation-sessions`
  - `GET /reconciliation-sessions/:id`
  - `POST /reconciliation-sessions`
  - `POST /reconciliation-sessions/:id/match`
  - `POST /reconciliation-sessions/:id/close`
- Dashboard: `GET /dashboard/summary`
- Reports:
  - `GET /reports/trial-balance`
  - `GET /reports/profit-loss`
  - `GET /reports/balance-sheet`
  - `GET /reports/ar-aging`
  - `GET /reports/ap-aging`
  - `GET /reports/vat-summary`
  - `GET /reports/ledger-lines`
- Audit/saved views/attachments:
  - `GET /audit-logs`
  - `GET /saved-views`, `POST /saved-views`, `PATCH /saved-views/:id`, `DELETE /saved-views/:id`
  - `GET /attachments`, `POST /attachments`, `DELETE /attachments/:id`

## Auth, guards, and interceptors

- `JwtAuthGuard`: validates bearer token and sets request context user/org
- `RbacGuard`: enforces required permissions and active membership
- `RequirePermissions(...)` decorator controls route-level permission requirements
- `ThrottlerGuard` is global; auth endpoints also apply tighter `@Throttle` limits

## Validation and error handling patterns

- Request validation uses shared Zod schemas via `ZodValidationPipe` in controllers
- Success envelope is standardized by interceptor:
  - `{ ok: true, data, requestId }`
- Error envelope is standardized by filter:
  - `{ ok: false, error: { code, message, details?, hint? }, requestId }`
- Error codes come from shared constants (`VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, etc.)

## Service-level backend patterns

- Org-scoped queries across services
- Idempotency-key support for most mutating endpoints (`Idempotency-Key` header)
- Audit logging on create/update/post/void actions
- Lock-date enforcement before posting/void/bounce/clear operations
- Base-currency-only posting checks
- GL balancing invariants before persistence
- GL reversal logic for void/bounce flows
- Number assignment at post-time using org settings (invoices, bills, expenses, payments, vendor payments)

## Background jobs/workers

- No async worker/queue/cron subsystem is present in `apps/api/src`.
- Redis exists in compose/env templates but no direct Redis-backed job processing code was found in API source.
