# 07 - Security

## Auth model

- Login/register issues:
  - access token in response body (JWT)
  - refresh token cookie (`refresh_token`, httpOnly, sameSite=lax, path `/auth`)
  - CSRF token cookie (`csrf_token`, readable by client, sameSite=lax, path `/auth`)
- Protected endpoints require bearer token via `JwtAuthGuard`.
- Refresh/logout endpoints support bearer refresh token or cookie refresh token; cookie mode requires CSRF header match.
- Refresh tokens are hashed in DB (`RefreshToken.tokenHash`), rotated on refresh, and can be revoked.

## Authorization (roles/permissions)

- RBAC is permission-code based (`packages/shared/src/permissions.ts`).
- `RequirePermissions(...)` decorator attaches required permission(s).
- `RbacGuard` verifies:
  - authenticated user context exists
  - active membership for org/user/membership
  - role has all required permissions (`RolePermission` checks)
- Bootstrap exceptions exist for first org creation/read (`/orgs`, `/orgs/current`) before org context is established.

## Request hardening and transport controls

- `helmet()` enabled globally.
- CORS configured with explicit origin from env and `credentials: true`.
- Global throttling enabled (60s/100 requests) + tighter per-route auth throttles.
- Cookie security flag switches to `secure: true` in production mode.

## Input validation and safe response shape

- Zod schemas validate request payloads/queries through `ZodValidationPipe`.
- All API responses are wrapped in a predictable envelope (success/error).
- Error filter maps status codes to normalized error codes and hints.

## Auditing and traceability

- Request context captures request ID, user ID, org ID, IP, user agent.
- Request ID is echoed in responses (`x-request-id` header and envelope).
- Audit logs persist before/after snapshots for important actions.
- HTTP logs redact sensitive fields (authorization header, password, refreshToken).

## Tenant safety assumptions

Tenant isolation is enforced primarily by application logic:

- Org context is derived from JWT claims and request context.
- Services/repositories query with `orgId` constraints.
- RBAC checks membership/role within org.
- Schema includes tenant-scoped uniqueness/indexing for many business keys.

## Additional controls in accounting flows

- Idempotency key support on many mutating endpoints reduces duplicate side effects.
- Lock-date checks prevent backdated mutations past configured lock date.
- Posting enforces base-currency-only policy (multi-currency posting blocked).
- GL invariants enforce balanced postings; void/bounce actions use explicit GL reversals.

## Notable security-related observations

- Access token is client-side in sessionStorage (not in httpOnly cookie).
- No DB-level row-level security policies are declared in Prisma schema; tenant safety relies on service/guard logic.
- `NEXT_PUBLIC_SENTRY_DSN` is read directly in web Sentry config (not through web env Zod validation).
