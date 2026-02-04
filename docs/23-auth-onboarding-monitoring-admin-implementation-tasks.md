# 23 - Authentication, Onboarding, Monitoring, and Platform Admin Implementation Tasks

## Purpose

Translate `docs/22-auth-onboarding-monitoring-admin-user-stories.md` into execution-ready tasks with phased delivery.

## Board status definitions

- `Backlog`: defined but not implementation-ready
- `Ready`: acceptance + dependencies clear
- `In Progress`: actively being implemented
- `Review`: PR opened / waiting review
- `Done`: merged and validated
- `Blocked`: dependency unresolved

---

## Story-to-task breakdown

## US-AOM-401 - Email verification during signup (Story 4.1)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `AOM-401-T01` | Add user verification state and verification token model with expiry/used-at fields | Backend | 1d | P0 | None | Prisma schema + migration | Review |
| `AOM-401-T02` | Update signup flow to create unverified users and send verification email | Backend | 1d | P0 | T01 | auth service/controller + mail templates | Review |
| `AOM-401-T03` | Add verify-email endpoint with one-time token enforcement | Backend | 0.75d | P0 | T01 | auth module | Review |
| `AOM-401-T04` | Block login for unverified users with actionable error message | Backend | 0.5d | P0 | T01 | auth login flow | Review |
| `AOM-401-T05` | Add API tests for token expiry, replay rejection, and login gating | QA/Backend | 0.75d | P1 | T02,T03,T04 | `apps/api/test/auth*.e2e-spec.ts` | In Progress |

## US-AOM-402 - Enforced org setup status lifecycle (Story 4.2)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `AOM-402-T01` | Add onboarding status model (`NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`) per org/user context | Backend | 0.75d | P0 | None | org/onboarding schema + service | Backlog |
| `AOM-402-T02` | Update org setup endpoints to persist status transitions | Backend | 0.75d | P0 | T01 | onboarding/org services | Backlog |
| `AOM-402-T03` | Build org setup state UI and status-aware progression | Frontend | 1d | P0 | T01,T02 | protected onboarding pages | Backlog |
| `AOM-402-T04` | Add partial-save support and resume flow | Fullstack | 0.75d | P1 | T02,T03 | onboarding API + UI | Backlog |
| `AOM-402-T05` | Add e2e tests for setup states and transitions | QA | 0.75d | P1 | T04 | web + api e2e | Backlog |

## US-AOM-403 - Redirect when setup incomplete (Story 4.3)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `AOM-403-T01` | Add auth/session guard that checks onboarding status on login/session restore | Fullstack | 0.75d | P0 | 402-T01 | auth + web session guard | Backlog |
| `AOM-403-T02` | Enforce route-level block for dashboard/modules until setup complete | Frontend | 0.75d | P0 | T01 | `apps/web/app/(protected)` guard logic | Backlog |
| `AOM-403-T03` | Add regression tests for redirect/block/unblock flows | QA | 0.5d | P1 | T01,T02 | Playwright auth/onboarding specs | Backlog |

## US-AOM-501 - Invite lifecycle by email and role (Story 5.1)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `AOM-501-T01` | Validate invite lifecycle statuses and transitions (`SENT`, `ACCEPTED`, `EXPIRED`, `REVOKED`) | Backend | 0.5d | P0 | None | org-users service | Backlog |
| `AOM-501-T02` | Ensure role-bound invite email is sent and tracked | Backend | 0.75d | P0 | T01 | invite service + mailer | Backlog |
| `AOM-501-T03` | Add admin UI state labels + resend/revoke controls | Frontend | 0.75d | P1 | T01 | dashboard users section | Backlog |
| `AOM-501-T04` | Add tests for status transitions and permissions | QA | 0.75d | P1 | T02,T03 | api/web invite tests | Backlog |

## US-AOM-502 - Invite link password setup (Story 5.2)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `AOM-502-T01` | Add password setup endpoint using invite token with one-time + expiry controls | Backend | 0.75d | P0 | 501-T01 | auth/org-users module | Backlog |
| `AOM-502-T02` | Build password setup page for invited users | Frontend | 0.75d | P0 | T01 | `apps/web/app/invite/page.tsx` | Backlog |
| `AOM-502-T03` | Add replay/expired token UX and tests | QA/Frontend | 0.5d | P1 | T02 | web tests + api tests | Backlog |

## US-AOM-601 to US-AOM-607 - Monitoring and observability stack (Epic 6)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `AOM-601-T01` | Define target stack and environment topology (Prometheus/Grafana/Loki/Tempo/Sentry/Uptime Kuma) | Platform | 0.75d | P0 | None | `docs/ops` architecture spec | Backlog |
| `AOM-601-T02` | Provision environment domains and auth/access controls for monitoring UIs | Platform | 1d | P0 | T01 | DNS, reverse proxy, security docs | Backlog |
| `AOM-602-T01` | Instrument API metrics endpoint and Prometheus scrape config | Backend/Platform | 0.75d | P0 | T01 | API bootstrap + Prometheus config | Backlog |
| `AOM-603-T01` | Standardize structured logs and ship to Loki by environment | Backend/Platform | 1d | P0 | T01 | logger config + promtail config | Backlog |
| `AOM-604-T01` | Enable OpenTelemetry tracing pipeline to Tempo/Jaeger with correlation ids | Backend/Platform | 1d | P1 | T01 | OTel collector + service instrumentation | Backlog |
| `AOM-605-T01` | Integrate Sentry release/error/performance tagging | Fullstack | 0.75d | P1 | T01 | api/web sentry config | Backlog |
| `AOM-606-T01` | Configure uptime checks for web/api/auth/swagger per environment | Platform | 0.5d | P1 | T02 | Uptime Kuma config | Backlog |
| `AOM-607-T01` | Apply telemetry guardrails (sampling, log levels, retention/cardinality limits) | Platform | 0.75d | P0 | 602-T01,603-T01,604-T01 | env/config docs | Backlog |
| `AOM-607-T02` | Add alert routes/playbooks and on-call runbook docs | Platform | 0.75d | P1 | 601-T02 | alerting + runbooks | Backlog |

## US-AOM-701 - Swagger API documentation (Story 7.1)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `AOM-701-T01` | Ensure Swagger generated for all auth/org/accounting endpoints with schemas | Backend | 0.75d | P1 | None | nest swagger decorators/modules | Backlog |
| `AOM-701-T02` | Gate swagger by environment/auth policy and expose consistent URL paths | Backend/Platform | 0.5d | P1 | T01 | app bootstrap + caddy/nginx routes | Backlog |
| `AOM-701-T03` | Add docs smoke checks for swagger availability per environment | QA | 0.5d | P2 | T02 | smoke suite scripts | Backlog |

## US-AOM-801 to US-AOM-803 - Product Manager global role (Epic 8)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `AOM-801-T01` | Introduce `LEDGERLITE_PRODUCT_MANAGER` role and permission matrix updates | Backend | 0.75d | P0 | None | shared permissions + auth guards | Backlog |
| `AOM-801-T02` | Build org directory API and admin UI with status/config summaries | Fullstack | 1d | P0 | T01 | admin module + web admin pages | Backlog |
| `AOM-802-T01` | Implement org activate/deactivate/lock/reset actions with audit reason | Backend | 1d | P0 | T01 | platform admin service | Backlog |
| `AOM-802-T02` | Build admin controls UI with confirmation and safety copy | Frontend | 0.75d | P1 | T01,T02 | admin UI | Backlog |
| `AOM-803-T01` | Add time-bound impersonation session model with clear UI indicator | Fullstack | 1.25d | P0 | T01 | auth/session + web shell indicator | Backlog |
| `AOM-803-T02` | Block sensitive actions during impersonation and audit all impersonation events | Backend | 0.75d | P0 | T01 | auth guards + audit logging | Backlog |
| `AOM-803-T03` | Add integration/e2e coverage for Product Manager workflows | QA | 1d | P1 | T02 | api/web admin tests | Backlog |

## US-AOM-901 and US-AOM-902 - Dashboard UX enhancements (Epic 9)

| Task ID | Task | Lane | Est. | Priority | Depends On | Suggested Files | Status |
| --- | --- | --- | ---: | --- | --- | --- | --- |
| `AOM-901-T01` | Define KPI card design tokens and card component variants | Frontend | 0.75d | P1 | None | ui card components + css tokens | Backlog |
| `AOM-901-T02` | Implement compact clickable KPI cards on home dashboard | Frontend | 1d | P1 | T01 | dashboard home page | Backlog |
| `AOM-902-T01` | Rework dashboard spacing/grouping hierarchy for readability | Frontend | 0.75d | P1 | T01 | dashboard layout/sections | Backlog |
| `AOM-902-T02` | Add responsive behavior tests for dashboard cards and grouping | QA | 0.75d | P2 | T02,T01 | web Playwright specs | Backlog |

---

## Cross-story tasks

| Task ID | Task | Lane | Est. | Priority | Depends On | Status |
| --- | --- | --- | ---: | --- | --- | --- |
| `AOM-X-T01` | Update env examples and deployment docs for new auth/monitoring/admin flags | Fullstack | 0.75d | P0 | Major stories | Backlog |
| `AOM-X-T02` | Expand smoke suite for verify/signup/invite/onboarding + swagger + uptime checks | QA | 1d | P1 | 401-403,501-502,701 | Backlog |
| `AOM-X-T03` | Add release checklist gates for observability and Product Manager audit validation | Fullstack | 0.5d | P1 | 601+,801+ | Backlog |

---

## Phase-by-phase implementation order

### Phase 1 (Security and onboarding gate) - P0

- `US-AOM-401`, `US-AOM-402`, `US-AOM-403`
- `US-AOM-501`, `US-AOM-502`

Exit criteria:
- unverified users blocked,
- setup-gating enforced,
- invite password flow secure and audited.

### Phase 2 (Platform visibility baseline) - P0/P1

- `US-AOM-601`, `US-AOM-602`, `US-AOM-603`, `US-AOM-606`, `US-AOM-607`

Exit criteria:
- metrics/logs/uptime in all environments,
- alert policies active,
- telemetry guardrails applied.

### Phase 3 (Tracing, APM, and docs) - P1

- `US-AOM-604`, `US-AOM-605`, `US-AOM-701`

Exit criteria:
- trace correlation working,
- release-linked error tracking enabled,
- swagger validated per environment.

### Phase 4 (Product Manager role and controls) - P0/P1

- `US-AOM-801`, `US-AOM-802`, `US-AOM-803`

Exit criteria:
- global org operations available and fully audited,
- impersonation bounded and visibly indicated.

### Phase 5 (Dashboard UX quality) - P1/P2

- `US-AOM-901`, `US-AOM-902`

Exit criteria:
- compact, responsive, clickable dashboard card system shipped.

---

## Estimated effort summary

- Phase 1: ~9.0 engineer-days
- Phase 2: ~5.75 engineer-days
- Phase 3: ~3.0 engineer-days
- Phase 4: ~6.25 engineer-days
- Phase 5: ~3.25 engineer-days
- Cross-story: ~2.25 engineer-days
- Total backlog estimate: ~29.5 engineer-days
