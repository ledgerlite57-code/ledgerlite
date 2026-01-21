# LedgerLite

LedgerLite is a modular monolith accounting system (NestJS + Next.js + PostgreSQL) built as vertical slices.

## Monorepo Structure

```
apps/
  api/      NestJS backend
  web/      Next.js frontend
packages/
  shared/   Zod schemas, enums, utilities
  config/   Shared lint/ts configs (placeholder)
```

## Local Dev (Phase 0)

1) Copy envs
```
cp .env.example .env
```

2) Start dependencies
```
docker compose up -d db redis
```

3) Install and run
```
pnpm install
pnpm dev
```

## Local Dev with Docker (API/Web hot reload)

```
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
```

## Tests

```
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
```
