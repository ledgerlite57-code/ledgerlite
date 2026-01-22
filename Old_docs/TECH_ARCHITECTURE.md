# LedgerLite – Technical Architecture & Stack

This document describes the **complete, finalized technology stack, tools, and architectural decisions** for building **LedgerLite**, a Zoho Books–style accounting system.

The goal is:

- Accounting correctness (ledger-first, double-entry)
- Clean, modern UI
- SaaS-first, with future on-prem capability
- Strong observability, security, and maintainability

> **Version:** v1.0  
> **Status:** FROZEN (changes require v1.1+)  
> **Audience:** Developers, Architects, Codex

---

## 1. High-Level Architecture

**Architecture style:** Modular Monolith

**Why:**
- Accounting systems benefit from **single-transaction boundaries**
- Easier enforcement of ledger immutability
- Faster MVP without premature microservices complexity

**Core components:**
- **API:** NestJS (business logic + accounting engine)
- **Web:** Next.js (UI, SSR where needed)
- **Database:** PostgreSQL
- **Shared:** Zod schemas + shared types

---

## 2. Monorepo Structure

**Monorepo tool:** Turborepo  
**Package manager:** pnpm

```text
ledgerlite/
  apps/
    api/          # NestJS backend
    web/          # Next.js frontend
  packages/
    shared/       # Zod schemas, enums, utils
    config/       # ESLint, TSConfig, Prettier
  docker-compose.yml
  .env.example
  README.md
```

---

## 3. Backend – NestJS API

### Core
- Node.js 20 LTS
- NestJS (latest stable)
- TypeScript
- REST API (JSON)
- OpenAPI / Swagger documentation

### Database
- PostgreSQL 16+
- Prisma ORM
- Prisma Migrate

### Validation & Types
- **Zod** as the single source of truth
- Zod schemas stored in `packages/shared`
- Used by:
  - API request validation
  - Frontend forms
  - Shared type inference

### Authentication & Security
- JWT access tokens
- Refresh tokens with rotation
- Password hashing: argon2
- RBAC permissions (Nest Guards + Policies)
- Rate limiting (`@nestjs/throttler`)
- Helmet (security headers)
- Strict CORS allowlists

### Logging
- Pino (JSON structured logs)
- Correlation ID (`requestId`)
- Logs include:
  - requestId
  - orgId
  - userId
  - endpoint
  - status code
  - duration
- Sensitive fields redacted

### Background Jobs
- BullMQ
- Redis 7

**Use cases:**
- Recurring invoices
- Email sending
- CSV imports
- PDF generation
- Backups

### Email
- Nodemailer (SMTP)
- React Email (preferred) or MJML templates
- All email sending handled via background jobs

### Testing
- Unit tests: Jest
- Integration tests: Supertest
- Test database: Postgres (Docker)

---

## 4. Frontend – Next.js Web App

### Core
- Next.js App Router
- TypeScript

### Rendering Strategy

**SSR**
- Landing pages
- Public documentation
- Optional public invoice links

**CSR**
- Authenticated app screens
- Invoices, Bills, Payments
- Banking & Reports

> ~90% of the accounting app uses CSR.

### UI & Design System
- shadcn/ui
- Tailwind CSS
- lucide-react icons
- TanStack Table (lists, reports)
- Recharts (charts, when needed)

### Forms & Validation
- react-hook-form
- Zod (shared schemas)
- Inline validation + toast feedback

### Data Fetching
- TanStack Query
- Central API client wrapper
- Automatic retries + caching

### Auth Handling
- Access token in memory
- Refresh token in httpOnly cookie
- Permission-based UI guards

### Frontend Testing
- Testing Library (components)
- Playwright (E2E accounting flows)

---

## 5. Shared Packages

### `packages/shared`
- Zod schemas (DTOs)
- Shared enums:
  - AccountType
  - DocumentStatus
  - TaxType
  - Permissions
- Utilities:
  - Money rounding
  - VAT calculation
  - Date helpers

This guarantees **API and UI never drift**.

---

## 6. Accounting & Database Design Principles

### Ledger Rules
- Immutable ledger entries
- Double-entry enforcement
- No edits to posted entries
- Reversals via credit notes or reversing journals

### Critical Constraints
- Prevent double posting:
  - `gl_headers(org_id, source_type, source_id) UNIQUE`
- Unique document numbers per org
- Foreign keys everywhere

### Transactions & Locks
- DB transactions for posting
- Row locks for:
  - Payment allocations
  - Bill payments

### Indexing (early)
- `gl_headers(org_id, posting_date)`
- `gl_lines(account_id)`
- `invoices(org_id, customer_id, invoice_date, status)`
- `bills(org_id, vendor_id, bill_date, status)`

---

## 7. Observability & Monitoring

### Error Tracking
- Sentry
- Captures:
  - API exceptions
  - Frontend runtime errors
  - Performance traces

### Logging
- Pino (API)
- Loki (log storage)
- Grafana (visualization)

### Metrics
- Prometheus
- Metrics collected:
  - Request count & latency
  - Error rates
  - DB latency
  - Job queue metrics

### Tracing
- OpenTelemetry
- Tempo or Jaeger backend
- Full trace of posting workflows

---

## 8. Storage & File Management

### Object Storage (Attachments & Generated Files)

Used for:
- Invoice & bill attachments
- Generated PDFs (invoices, receipts, reports)
- Imported CSV / bank statement files

**Storage providers:**
- AWS S3
- Cloudflare R2
- DigitalOcean Spaces
- **On-prem:** MinIO (S3-compatible)

**Storage pattern:**
- Files are **never stored in the database**
- Database stores **metadata only** (`attachments` table)
- Object key format:
  ```
  org/<orgId>/<entityType>/<entityId>/<attachmentId>/<filename>
  ```

**Access control:**
- Upload via pre-signed URLs
- Download via pre-signed URLs
- Permission checks enforced before URL issuance

---

## 9. Notifications & Communication

### Email Notifications
- Invoice delivery
- Payment receipts
- Overdue reminders
- User invitations
- System alerts

**Rules:**
- Always async (BullMQ)
- Never inline with API requests

### In-App Notifications
- Stored in `notifications` table
- API polling in v1
- WebSocket/SSE (phase 2)

---

## 10. Document Generation & Output

### PDF Generation
- HTML → PDF using Playwright (headless Chromium)
- Executed via background jobs
- Stored in object storage
- Linked via `attachments`

---

## 11. Import & Export

### Import
- Customers
- Vendors
- Items
- Bank statements

**Design:**
- CSV upload
- Background validation
- Partial success allowed
- Import audit history stored

### Export
- CSV export for lists & reports
- PDF export for financial statements

---

## 12. DevOps, Environments & Releases

### Environments
- `local`
- `dev`
- `staging`
- `production`

Each environment has:
- Separate database
- Separate object storage bucket
- Separate secrets

### Branching Strategy
- `main` → production
- `staging` → staging
- `develop` → dev
- `feature/*` → feature development
- `hotfix/*` → production fixes

### CI/CD
- GitHub Actions
- Pipeline:
  - lint
  - typecheck
  - unit tests
  - integration tests
  - build images
  - run migrations
  - deploy

---

## 13. Data Safety & Controls

### Period Locking
- `lockDate` per organization
- Prevent posting/editing before lock
- Override only for privileged roles

### Numbering Rules
- Prefix + sequence per document type
- Assigned on posting
- DB-level uniqueness enforced

---

## 14. Platform Security (Phase 2)

- Two-factor authentication (2FA)
- Session revocation
- Login/device audit trail
- Per-org rate limiting
- Feature flags

---

## 15. Performance & Reporting Strategy

- Indexed ledger tables
- Read-only reporting queries
- Short-TTL caching for reports
- Materialized views (phase 2)
- Read replicas (phase 2)

---

## 16. Explicit Non-Goals (v1)

- No gRPC
- No microservices
- No serverless core accounting logic
- No inventory valuation
- No multi-entity consolidation

These may be introduced **only after the accounting core is stable**.

---

## Final Stack Summary

**Backend:** NestJS + Prisma + PostgreSQL + Zod + JWT + Pino + Swagger + BullMQ  
**Frontend:** Next.js + shadcn/ui + Tailwind + TanStack Query/Table + RHF + Zod  
**Storage:** S3-compatible (S3 / R2 / MinIO)  
**Observability:** Sentry + OpenTelemetry + Grafana + Prometheus + Loki + Tempo  
**DevOps:** Docker Compose + Turborepo + pnpm + GitHub Actions  

---

This README is the **single source of truth** for LedgerLite’s technical foundation.
