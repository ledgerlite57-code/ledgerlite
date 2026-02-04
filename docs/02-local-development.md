# 02 - Local Development

## Prerequisites

- Node.js 20.x (matches CI and Dockerfiles)
- pnpm 9.12.0 (repo `packageManager`)
- Docker + Docker Compose (for Postgres, Redis, optional full-stack containers)

## Quick start (host machine)

1. Create env file:

   ```bash
   cp .env.example .env
   ```

2. Start dependencies:

   ```bash
   docker compose up -d db redis
   ```

3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Generate Prisma client, migrate, and seed:

   ```bash
   pnpm --filter @ledgerlite/api db:generate
   pnpm --filter @ledgerlite/api db:migrate
   pnpm --filter @ledgerlite/api db:seed
   ```

5. Start apps:

   ```bash
   pnpm dev
   ```

- Web default: `http://localhost:3000`
- API default: `http://localhost:4000`

## Alternative: Docker dev stack (hot reload containers)

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
```

This compose file runs `shared`, `api`, and `web` in Node containers with mounted source.

## Environment-specific compose files

- `docker-compose.development.yml` (ports 23000/24000)
- `docker-compose.staging.yml` (localhost-bound 13000/14000)
- `docker-compose.prod.yml` (localhost-bound 3000/4000)

Each expects corresponding env files (`.env.development`, `.env.staging`, `.env.prod`).

## Environment variables and purpose

### Core/API vars

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (API runtime + Prisma config/seed) |
| `API_PORT` | API listen port |
| `API_JWT_SECRET` | Access token signing secret |
| `API_JWT_REFRESH_SECRET` | Refresh token signing secret |
| `API_JWT_ACCESS_TTL` | Access token TTL in seconds |
| `API_JWT_REFRESH_TTL` | Refresh token TTL in seconds |
| `API_CORS_ORIGIN` | Allowed web origin for API CORS |
| `WEB_BASE_URL` | Used to construct invite links |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Invite email transport config |
| `SMTP_DISABLE` | Disables email sending when true |
| `INVENTORY_COST_EFFECTIVE_DATE_ENABLED` | Feature flag for backdated inventory cost cutoff behavior |
| `INVENTORY_COST_HIGH_PRECISION_QTY_ENABLED` | Feature flag registry entry for high-precision inventory quantity costing |
| `NEGATIVE_STOCK_POLICY_ENABLED` | Feature flag registry entry for org-level negative stock policy controls |
| `INVITE_LIFECYCLE_ENABLED` | Feature flag registry entry for invite resend/revoke/status lifecycle |
| `ONBOARDING_CHECKLIST_ENABLED` | Feature flag registry entry for role-based onboarding checklist APIs/UI |
| `SENTRY_DSN` / `SENTRY_ENVIRONMENT` | Backend Sentry config |

### Web vars

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Base URL used by frontend API client |
| `NEXT_PUBLIC_APP_VERSION` | Build/version badge shown in UI |
| `NEXT_PUBLIC_SENTRY_DSN` | Used by `sentry.client.config.ts` and `sentry.server.config.ts` |

### Other vars present in templates

| Variable | Notes |
|---|---|
| `WEB_PORT` | Present in `.env.example`; web app scripts are hardcoded to port 3000 |
| `REDIS_URL` | Present in `.env.example`; no direct usage found in `apps/api/src` or `apps/web/src` |
| `POSTGRES_PASSWORD` | Used by deployment compose files for DB service |

## Database setup details

- Prisma schema: `apps/api/prisma/schema.prisma`
- Prisma config: `apps/api/prisma.config.ts`
- Migrations: `apps/api/prisma/migrations/*`
- Seed script: `apps/api/prisma/seed.ts`

Common commands:

```bash
pnpm --filter @ledgerlite/api db:generate
pnpm --filter @ledgerlite/api db:migrate
pnpm --filter @ledgerlite/api db:seed
```

## Dev/build/start/test commands

### Root

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```

### API only

```bash
pnpm --filter @ledgerlite/api dev
pnpm --filter @ledgerlite/api build
pnpm --filter @ledgerlite/api start
```

### Web only

```bash
pnpm --filter @ledgerlite/web dev
pnpm --filter @ledgerlite/web build
pnpm --filter @ledgerlite/web start
pnpm --filter @ledgerlite/web test:e2e
```

## Seeded local credentials

In non-production flows, the seed/login UX references:

- `owner@ledgerlite.local`
- `Password123!`

(From `apps/api/prisma/seed.ts` and `apps/web/app/login/page.tsx`.)
