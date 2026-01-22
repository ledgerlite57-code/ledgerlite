# LedgerLite – Architecture Diagrams

This document provides **implementable architecture diagrams** for LedgerLite (NestJS + Next.js + PostgreSQL).
It reflects the **final v1.0 frozen architecture**, including storage, notifications, observability, and deployment concerns.

> **Version:** v1.0  
> **Status:** FROZEN  
> **Audience:** Engineering, Architecture, Codex

---

## Diagram 1 — System Context (High Level)

```
   +---------------------+                 +------------------------------+
   |   Browser / User    |                 |        Observability         |
   |  (Desktop/Mobile)   |                 | Grafana / Loki / Tempo       |
   +----------+----------+                 +----------+-------------------+
              |                                       ^
              | HTTPS                                  |
              v                                       |
   +---------------------+           Logs/Metrics/Traces|
   |      Next.js Web    |------------------------------+
   |  (SSR + CSR pages)  |
   +----------+----------+
              |
              | REST (JSON)
              v
   +---------------------+      SQL/Transactions     +-------------------+
   |     NestJS API      |-------------------------->|   PostgreSQL DB   |
   | (Auth, Docs, GL)    |                           | (source of truth) |
   +----------+----------+                           +-------------------+
              |
              | Jobs
              v
   +---------------------+        +----------------------+
   |  Redis + BullMQ     |        |  Object Storage      |
   | (emails, pdf, csv)  |------->|  S3 / R2 / MinIO     |
   +---------------------+        +----------------------+

   +---------------------+
   |  Sentry (Errors)    |
   | Web + API           |
   +---------------------+
```

**Key Notes**
- Next.js handles UI + SSR only.
- NestJS is the sole authority for accounting, totals, and posting.
- PostgreSQL stores documents, ledger, audit, and idempotency data.
- Files and PDFs live in object storage.
- All async work is offloaded to BullMQ.

---

## Diagram 2 — Monorepo & Runtime Deployment

```
Repo (Turborepo)

ledgerlite/
  apps/
    web/      -> Next.js
    api/      -> NestJS
  packages/
    shared/   -> Zod schemas, enums, utils

Runtime (Docker Compose)

+----------------+    +----------------+    +----------------+
|  web container |    |  api container |    |  db container  |
| Next.js        |    | NestJS         |    | PostgreSQL     |
+-------+--------+    +-------+--------+    +-------+--------+
        |                     |                     |
        | REST                | SQL                 |
        +-------------------->|-------------------->|

Optional / supporting services:
+-----------+      +-------------+      +-------------+      +------------+
| redis     |      | grafana     |      | loki/tempo  |      | minio      |
| bullmq    |      | prometheus |      | tracing     |      | (optional) |
+-----------+      +-------------+      +-------------+      +------------+
```

---

## Diagram 3 — NestJS Modular Monolith

```
                   +------------------+
                   |   Auth Module    |
                   | JWT, refresh,    |
                   | RBAC guards      |
                   +--------+---------+
                            |
+------------------+        |       +------------------+
|   Org Module     |--------+-------|  Users Module    |
| settings, VAT    |                | roles, invites   |
+------------------+                +------------------+

+------------------+      +------------------+      +------------------+
| Accounts Module  |<---->|  Ledger Module   |<---->| Reports Module   |
| chart of accts   |      | gl headers/lines |      | TB/PL/BS/VAT     |
+------------------+      +------------------+      +------------------+

+------------------+      +------------------+
| Tax Module       |<---->| Items Module     |
| VAT codes/rates  |      | products/services|
+------------------+      +------------------+

+------------------+      +------------------+      +------------------+
| Customers Module |<---->| Invoices Module  |<---->| Payments Module  |
| customers        |      | invoice lifecycle|      | receive payments |
+------------------+      +------------------+      +------------------+

+------------------+      +------------------+      +------------------+
| Vendors Module   |<---->| Bills Module     |<---->| Payments Module  |
| vendors          |      | bill lifecycle   |      | pay bills        |
+------------------+      +------------------+      +------------------+

+------------------+      +------------------+
| Banking Module   |<---->| Reconcile Module |
| bank accts/import|      | matching rules   |
+------------------+      +------------------+

+------------------+
| Attachments Mod. |
| file metadata    |
+------------------+

+------------------+
| Audit Module     |
| audit trail      |
+------------------+
```

**Dependency Rules**
- Only LedgerModule writes to `gl_headers` and `gl_lines`.
- Feature modules call Ledger via a single service interface.
- Audit logging is invoked from domain services, not controllers.

---

## Diagram 4 — Request Flow with Auth & Correlation

```
Browser
  |
  | 1) Request (CSR/SSR)
  v
Next.js Web
  |
  | 2) fetch() API
  |    - Authorization: Bearer <token>
  |    - X-Request-Id
  v
NestJS API
  |
  | Middleware
  | - requestId
  | - orgId / userId context
  |
  | Guards
  | - JWT validation
  | - RBAC permissions
  |
  | Controller → Service
  |
  | Prisma transaction (writes)
  v
PostgreSQL
```

---

## Diagram 5 — Posting Engine Flow (Invoice Post)

```
User clicks "Post Invoice"
        |
        v
POST /invoices/:id/post
        |
        v
InvoicesService.post()
  |
  | Begin DB transaction
  | Lock invoice FOR UPDATE
  | Recompute totals server-side
  | Validate config/accounts
  | Create GL header (unique)
  | Create balanced GL lines
  | Update invoice status
  | Write audit log
  |
  | Commit
```

**Ledger Lines**
- Dr Accounts Receivable
- Cr Sales Revenue
- Cr VAT Payable

**Guardrails**
- UNIQUE (org_id, source_type, source_id)
- Optional idempotency key

---

## Diagram 6 — Payment Allocation Flow

```
POST /payments-received/:id/post
  |
  | Begin transaction
  | Lock payment + invoice rows
  | Validate outstanding
  | Create GL entries
  | Update invoice balances
  | Audit
  |
  | Commit
```

---

## Diagram 7 — Reporting Read Path

```
Next.js (CSR)
  |
  | GET /reports/*
  v
ReportsService
  |
  | Read-only ledger queries
  | Group/sum debits & credits
  v
Response
```

**Rules**
- Ledger is the only source of truth.
- Reports never write data.

---

## Diagram 8 — Attachments & PDF Flow

```
User uploads file
  |
  | Request signed upload URL
  v
NestJS API
  |
  | Permission check
  | Issue pre-signed URL
  v
Object Storage (S3/R2/MinIO)
  |
  | Metadata saved in DB
```

```
PDF generation
  |
  | BullMQ job
  v
Playwright (HTML → PDF)
  |
  | Upload to object storage
  v
Attach to document
```

---

## Diagram 9 — Observability Architecture

```
Web (Next.js)
  | \
  |  \__ Sentry
  |   \__ OpenTelemetry
  |
API (NestJS)
  |\
  | \__ Pino logs ----> Loki ---> Grafana
  |  \__ Metrics ----> Prometheus -> Grafana
  |   \__ Traces ----> Tempo/Jaeger -> Grafana
```

**Must-have Dashboards**
- API latency p95/p99
- Posting error rate
- Auth failure rate
- Job queue success/failure

---

## Diagram 10 — Data Ownership Boundaries

```
Next.js
  - UI state only
  - Never final authority for totals

NestJS
  - Totals, taxes, posting
  - Permissions & audit

PostgreSQL
  - Documents
  - Ledger
  - Audit
  - Idempotency
```

---

## Diagram 11 — Future Scalability Path (Optional)

```
Web
  |
API Gateway (NestJS)
  |\
  | \__ Accounting Core (Monolith)
  |  \__ Reporting Service
  |   \__ Notification Service
  |
Database
  - Single DB initially
```

**Rule:** Split services only after schema and posting engine are stable.

---

This document is part of the **LedgerLite v1.0 frozen specification**.
