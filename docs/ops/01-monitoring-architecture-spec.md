# 01 - Monitoring Architecture Specification

## Scope

Define the target monitoring and observability architecture for LedgerLite across:

- `development`
- `staging`
- `production`

This document covers stack choice, topology, data separation, access model, and rollout sequence.

Implementation runbook:

- `docs/ops/02-monitoring-domains-and-access-runbook.md`
- `docs/ops/03-prometheus-scrape-config.md`
- `docs/ops/04-loki-promtail-runbook.md`
- `docs/ops/05-otel-tempo-runbook.md`
- `docs/ops/06-sentry-release-and-apm-runbook.md`
- `docs/ops/07-uptime-kuma-runbook.md`
- `docs/ops/08-telemetry-guardrails.md`
- `docs/ops/09-alert-routing-and-oncall-runbook.md`

---

## Objectives

- Detect outages and regressions quickly.
- Isolate telemetry by environment.
- Correlate metrics, logs, and traces by request.
- Keep overhead low and predictable.
- Avoid exposing sensitive business data in telemetry.

---

## Target stack (self-hosted)

- **Metrics**: Prometheus
- **Dashboards / alert views**: Grafana
- **Host metrics**: Node Exporter
- **Container metrics**: cAdvisor
- **Logs**: Loki + Promtail
- **Traces**: OpenTelemetry Collector + Tempo
- **Error tracking / APM**: Sentry (already integrated in app config)
- **Synthetic uptime**: Uptime Kuma
- **Alert routing**: Grafana Alerting (email/webhook as first channel)

---

## Environment topology

## Logical separation

Each environment keeps separate telemetry data and alert rules:

- Prometheus:
  - `prom-dev`
  - `prom-staging`
  - `prom-prod`
- Loki:
  - `loki-dev`
  - `loki-staging`
  - `loki-prod`
- Tempo:
  - `tempo-dev`
  - `tempo-staging`
  - `tempo-prod`
- Grafana:
  - one instance with strict folder/data source RBAC **or**
  - one instance per environment (preferred for hard isolation)
- Uptime Kuma:
  - one instance with separate monitor groups per environment (minimum)

## Suggested domains

- `monitor-dev.ledgerlite.net`
- `monitor-staging.ledgerlite.net`
- `monitor.ledgerlite.net` (production)

Note: DNS and reverse-proxy provisioning is tracked separately in `AOM-601-T02`.

---

## Data model standards

## Required metric labels

- `env` (`development|staging|production`)
- `service` (`api|web|db|proxy`)
- `instance`

Do **not** use high-cardinality labels such as user email or raw request path with IDs.

## Required structured log fields

- `timestamp`
- `level`
- `env`
- `service`
- `requestId`
- `route`
- `statusCode`
- `durationMs`

Optional safe fields:

- `orgId`
- `userId`

Never log passwords, JWTs, refresh tokens, SMTP secrets, or request bodies containing credentials.

## Required trace attributes

- `service.name`
- `deployment.environment`
- `http.method`
- `http.route`
- `http.status_code`
- `request.id` (from request context)

---

## Telemetry guardrails (baseline defaults)

## Development

- Log level: `debug`
- Trace sampling: `1.0` (100%)
- Metrics scrape interval: `15s`
- Retention: short (3-7 days)

## Staging

- Log level: `info`
- Trace sampling: `0.2` to `0.5`
- Metrics scrape interval: `15s`
- Retention: medium (7-14 days)

## Production

- Log level: `warn` (plus `error`)
- Trace sampling: `0.01` to `0.05`
- Metrics scrape interval: `15s` or `30s`
- Retention: 14-30 days (based on disk budget)

---

## Initial alert set (minimum viable)

- API health endpoint down (`/health`) for 2m
- 5xx rate > 5% for 5m
- p95 latency above threshold for 5m
- Host disk usage > 85%
- DB not ready
- Container restart loop

Alert severity model:

- `critical`: outage or data risk
- `warning`: degradation trend

---

## Security and access

- All monitoring UIs must require authentication.
- Public anonymous access is disabled.
- Restrict network ingress to:
  - VPN / office IP allowlist, or
  - authenticated reverse proxy.
- Secrets are stored in deployment environment secrets only.
- Monitoring components run with least-privilege service accounts.

---

## Rollout plan

## Step 1 (baseline)

- Deploy Prometheus, Grafana, Node Exporter, cAdvisor, Uptime Kuma.
- Add `/health` uptime checks for dev/staging/prod.
- Create core API/host dashboards.

## Step 2 (logs)

- Deploy Loki + Promtail.
- Standardize API log fields and labels.

## Step 3 (tracing)

- Deploy OTel Collector + Tempo.
- Enable API trace export with environment-based sampling.

## Step 4 (hardening)

- Apply retention limits.
- Add alert routing and runbooks.
- Review cardinality and storage usage monthly.

---

## Acceptance criteria for `AOM-601-T01`

- Stack choice is finalized and documented.
- Environment topology and domain pattern are defined.
- Data/label standards are defined.
- Guardrails and initial alert set are defined.
- Rollout sequence is defined and actionable.
