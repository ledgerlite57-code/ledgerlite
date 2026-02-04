# 00 - Repository Overview

## What this repository is

LedgerLite is a pnpm/turborepo monorepo with a **NestJS API** (`apps/api`), a **Next.js web app** (`apps/web`), and a shared TypeScript package (`packages/shared`) used by both.

The backend is implemented as a modular monolith (vertical slices by domain) and uses PostgreSQL via Prisma.

## High-level folder tree

```text
.
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── migrations/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── modules/...
│   │   │   ├── auth/
│   │   │   ├── common/
│   │   │   ├── logging/
│   │   │   ├── prisma/
│   │   │   └── main.ts
│   │   └── test/
│   └── web/
│       ├── app/
│       │   ├── (protected)/...
│       │   ├── login/
│       │   ├── signup/
│       │   └── invite/
│       ├── src/
│       │   ├── features/
│       │   ├── lib/
│       │   └── env.ts
│       └── tests/
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── schemas/
│   │       ├── permissions.ts
│   │       ├── errors.ts
│   │       └── api.ts
│   └── config/
│       ├── eslint-*.cjs
│       ├── prettier.cjs
│       └── tsconfig.base.json
├── .github/workflows/
├── docker-compose*.yml
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Tech stack

| Area | Stack | Evidence |
|---|---|---|
| Monorepo/tooling | pnpm workspaces + Turborepo | `pnpm-workspace.yaml`, `turbo.json`, root `package.json` |
| Runtime baseline | Node 20 (Docker/CI) | `apps/*/Dockerfile`, `.github/workflows/ci.yml` |
| Backend framework | NestJS 11 | `apps/api/package.json` (`@nestjs/*`) |
| ORM/DB | Prisma 7 + PostgreSQL + `@prisma/adapter-pg` | `apps/api/package.json`, `apps/api/prisma/schema.prisma` |
| Backend validation | Zod | `apps/api/src/common/zod-validation.pipe.ts`, `packages/shared/src/schemas/*` |
| Auth/security libs | JWT, argon2, helmet, throttler, cookie-parser | `apps/api/package.json`, `apps/api/src/main.ts` |
| Backend observability | pino/pino-http, Sentry | `apps/api/src/logging/*`, `apps/api/src/main.ts` |
| Frontend framework | Next.js 16 App Router + React 19 | `apps/web/package.json`, `apps/web/app/*` |
| Frontend forms | react-hook-form + Zod resolver | `apps/web/app/**/*.tsx`, `apps/web/src/lib/zod-resolver.ts` |
| Frontend styling/UI | Tailwind CSS + Radix UI primitives | `apps/web/tailwind.config.ts`, `apps/web/src/lib/ui-*.tsx` |
| E2E testing | Playwright (web), Jest (API) | `apps/web/playwright.config.ts`, `apps/api/jest.config.js` |
| Shared contracts | Shared schemas/permissions/errors package | `packages/shared/src/*` |

## Apps and packages summary

| Workspace | Purpose | Entry points |
|---|---|---|
| `apps/api` (`@ledgerlite/api`) | REST API, auth, accounting modules, reporting, auditing | `apps/api/src/main.ts`, `apps/api/src/app.module.ts` |
| `apps/web` (`@ledgerlite/web`) | Web UI (auth, dashboard, CRUD pages, reports) | `apps/web/app/layout.tsx`, `apps/web/app/(protected)/*` |
| `packages/shared` (`@ledgerlite/shared`) | Zod schemas, permission constants, API envelope/error types | `packages/shared/src/index.ts` |
| `packages/config` (`@ledgerlite/config`) | Shared ESLint/TS/Prettier config | `packages/config/*` |

## Build/dev scripts and repo usage

### Root scripts

- `pnpm dev` -> `turbo dev` (runs workspace `dev` scripts)
- `pnpm build` -> `turbo build`
- `pnpm lint` -> `turbo lint`
- `pnpm typecheck` -> `turbo typecheck`
- `pnpm test` -> `turbo test`
- `pnpm test:e2e` -> `turbo test:e2e`

### App-level scripts

- API: `dev`, `build`, `start`, `db:generate`, `db:migrate`, `db:seed`
- Web: `dev`, `build`, `start`, `test:e2e` (Playwright)
- Shared: `build`, `dev`, `typecheck`

## Environment/config pattern (at repo level)

- Local baseline env template: `.env.example`
- Environment-specific templates: `.env.development.example`, `.env.staging.example`, `.env.prod.example`
- Docker compose sets:
  - local (`docker-compose.yml`, `docker-compose.dev.yml`)
  - deploy-style environments (`docker-compose.development.yml`, `docker-compose.staging.yml`, `docker-compose.prod.yml`)
- CI pipeline runs install, Prisma generate, lint, typecheck, build (`.github/workflows/ci.yml`)
- Deployment workflow uses SSH + Docker Compose + `prisma migrate deploy` (`.github/workflows/deploy.yml`)

## How this repo is meant to be used

1. Run Postgres (and optionally Redis) via Docker.
2. Install dependencies with pnpm.
3. Generate Prisma client / run migrations / seed data for API.
4. Run API and Web together via root `pnpm dev` (turbo) or run each app separately.
5. Use shared contracts (`@ledgerlite/shared`) as the source of truth for request/response validation and permission names.
