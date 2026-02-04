# 06 - Configuration

## Environment variable strategy

## File strategy

- Base local template: `.env.example`
- Environment templates:
  - `.env.development.example`
  - `.env.staging.example`
  - `.env.prod.example`
- Deployment compose files expect sibling env files (`.env.development`, `.env.staging`, `.env.prod`) referenced via `--env-file`.

## Runtime validation strategy

- API env is validated once with Zod (`apps/api/src/common/env.ts`)
- Web public env is validated with Zod (`apps/web/src/env.ts`) for:
  - `NEXT_PUBLIC_API_BASE_URL`
  - `NEXT_PUBLIC_APP_VERSION`
- Some values are read directly without web Zod validation (for example `NEXT_PUBLIC_SENTRY_DSN` in web Sentry config files).

## Config files and purpose

| File | Purpose |
|---|---|
| `package.json` (root) | monorepo scripts and dev tooling deps |
| `pnpm-workspace.yaml` | workspace package globs |
| `turbo.json` | task graph/caching strategy |
| `packages/config/tsconfig.base.json` | shared TypeScript compiler baseline |
| `packages/config/eslint-*.cjs` | shared ESLint rules (node/react) |
| `packages/config/prettier.cjs` | shared Prettier rules |
| `apps/api/prisma.config.ts` | Prisma schema/datasource/seed config |
| `apps/api/prisma/schema.prisma` | database schema |
| `apps/web/next.config.js` | Next.js runtime config (`reactStrictMode`) |
| `apps/web/tailwind.config.ts` | Tailwind content/theme/plugins |
| `apps/web/postcss.config.js` | Tailwind + autoprefixer pipeline |
| `apps/web/sentry.client.config.ts` | browser Sentry init |
| `apps/web/sentry.server.config.ts` | server Sentry init |
| `.github/workflows/ci.yml` | CI quality checks (install, generate, lint, typecheck, build) |
| `.github/workflows/deploy.yml` | branch/env deploy orchestration |
| `docker-compose.yml` | local stack (db, redis, api, web) |
| `docker-compose.dev.yml` | containerized dev with mounted source |
| `docker-compose.development.yml` | development deploy profile |
| `docker-compose.staging.yml` | staging deploy profile |
| `docker-compose.prod.yml` | production deploy profile |
| `ops/deploy/remote-deploy.sh` | shell deploy helper mirroring workflow behavior |

## Docker/runtime config patterns

- API and Web images both use Node 20 Alpine.
- Build process installs filtered workspace deps and builds `packages/shared` first.
- API image runs Prisma generate before app build.
- Deployment flow runs `prisma migrate deploy` inside API container.

## CI/CD config behavior

### CI

- Triggers on pushes/PRs for `main`, `staging`, `dev` and branch patterns.
- Steps:
  - setup pnpm/node
  - `pnpm install --frozen-lockfile`
  - `pnpm --filter @ledgerlite/api db:generate`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm build`

### Deploy

- Branch-to-environment mapping in workflow and `remote-deploy.sh`:
  - `dev` -> development
  - `staging` -> staging
  - `main` -> production
- Performs git pull, env-file resolution, compose up/build, Prisma migrate deploy, health check.
