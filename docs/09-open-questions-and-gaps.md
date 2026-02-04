# 09 - Open Questions and Gaps

## Missing or inconsistent documentation

- `README.md` references `docs/DEVOPS_SETUP.md`, but that file is not present in the repository state analyzed.
- No dedicated contributor guide was found for:
  - coding conventions beyond lint/type configs
  - branching/release workflow details beyond CI/CD YAML and deploy script

## Ambiguous or implicit flows

- Redis is declared in local env/compose, but no direct runtime usage was found in API/Web source. Clarify intended near-term use.
- `WEB_PORT` appears in `.env.example`, but web scripts are fixed to port 3000; usage intent is unclear.
- Web Sentry DSN (`NEXT_PUBLIC_SENTRY_DSN`) is configured in Sentry init files but not part of `apps/web/src/env.ts` validation.

## Potential technical debt (observed, not fixed)

- Tenant safety is app-enforced (guards/query scoping) without DB-level row-level security policies.
- Access token is stored in sessionStorage (standard SPA pattern, but still a deliberate tradeoff).
- Large service classes in transactional modules (invoice/bill/payment/pdc/etc.) combine validation, business rules, posting logic, and persistence in one layer.
- Extensive business logic in seed script (`apps/api/prisma/seed.ts`) increases seed complexity and maintenance surface.
- API uses both repository-backed and direct service Prisma access across modules, so data-access pattern is not fully uniform.

## Testing/quality gaps

- Web package `test` script currently reports `"no tests yet"`; only Playwright e2e is wired as executable web tests.
- CI currently validates lint/typecheck/build, but does not run API e2e or web Playwright by default.

## TODO candidates for future improvement

- Document authoritative environment matrix (local/dev/staging/prod) in one place with required/optional vars.
- Add explicit architecture decision records for auth token storage, tenant isolation strategy, and GL posting/reversal policy.
- Decide and document Redis role (remove if not needed, or implement and document queue/cache/session use).
- Standardize repository-vs-service Prisma access style across all modules.
- Define whether CI should include selected e2e suites and under what constraints.
