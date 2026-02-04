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

## CI/CD + Branching

For a complete GitHub branching and AWS EC2 deployment setup, see:

`docs/DEVOPS_SETUP.md`

## Documentation

- [00 - Repository Overview](docs/00-repo-overview.md)
- [01 - Architecture Overview](docs/01-architecture-overview.md)
- [02 - Local Development](docs/02-local-development.md)
- [03 - Database Schema](docs/03-database-schema.md)
- [04 - Backend API](docs/04-backend-api.md)
- [05 - Frontend Web](docs/05-frontend-web.md)
- [06 - Configuration](docs/06-configuration.md)
- [07 - Security](docs/07-security.md)
- [08 - Quality and Standards](docs/08-quality-and-standards.md)
- [09 - Open Questions and Gaps](docs/09-open-questions-and-gaps.md)
- [10 - Accounting Improvements Roadmap](docs/10-accounting-improvements-roadmap.md)
- [11 - Accounting User Stories](docs/11-accounting-user-stories.md)
- [12 - Sprint Board](docs/12-sprint-board.md)

### How to navigate this repo

If you are new, read docs in order from `docs/00-repo-overview.md` through `docs/12-sprint-board.md`. The sequence moves from structure and architecture to operations, quality, open gaps, roadmap planning, detailed user stories, and sprint execution.
