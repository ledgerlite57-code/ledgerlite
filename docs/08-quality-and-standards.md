# 08 - Quality and Standards

## Linting

- Monorepo lint command: `pnpm lint` (via turbo)
- Shared ESLint config in `packages/config`:
  - `eslint-base.cjs`
  - `eslint-node.cjs`
  - `eslint-react.cjs`
- Workspace usage:
  - API/shared extend node config
  - Web extends react config + `next/core-web-vitals`

## Formatting

- Prettier config is centralized in `packages/config/prettier.cjs`
- Root `.prettierrc.cjs` re-exports shared config
- Commands:
  - `pnpm format` (check)
  - `pnpm format:write`

## Type safety

- Shared strict TS baseline in `packages/config/tsconfig.base.json` (`strict: true`)
- API and shared compile to `dist`; web uses no-emit TS checks
- Typecheck commands:
  - root: `pnpm typecheck`
  - API: `pnpm --filter @ledgerlite/api typecheck`
  - Web: `pnpm --filter @ledgerlite/web typecheck`
  - Shared: `pnpm --filter @ledgerlite/shared typecheck`

## Shared contract standards

- Request/response contract types and validation schemas are centralized in `@ledgerlite/shared`.
- Permissions and error codes are also shared, reducing frontend/backend drift.
- API envelopes (`ok/data` and `ok/error`) are standardized and consumed by frontend client.

## Testing setup

## API tests

- Framework: Jest (`apps/api/jest.config.js`)
- Test locations:
  - unit/spec files under `apps/api/src` (`*.spec.ts`)
  - integration/e2e under `apps/api/test` (`*.e2e-spec.ts`, `*.int-spec.ts`)
- Focus areas include auth, RBAC, idempotency, VAT, lock-date, reports, reconciliation, inventory, attachments.

## Web tests

- Framework: Playwright (`apps/web/playwright.config.ts`)
- Tests under `apps/web/tests/*.spec.ts`
- Global setup seeds backend (`pnpm --filter @ledgerlite/api db:seed`) unless `PW_SKIP_SEED` is set.

## CI quality gates

CI workflow (`.github/workflows/ci.yml`) runs:

1. install (`pnpm install --frozen-lockfile`)
2. API Prisma generate
3. lint
4. typecheck
5. build

No coverage threshold gating is defined in workflow; API Jest config does define coverage collection paths/output directory.

## Observed standards in implementation

- Error-handling consistency through shared error codes and API envelopes
- Request validation via Zod at controller boundaries
- Audit logging of business mutations
- Idempotency support for many mutation endpoints
