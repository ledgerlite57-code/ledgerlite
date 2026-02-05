# 03 - Prometheus Scrape Configuration

## Scope

Define the baseline Prometheus scrape jobs for LedgerLite API metrics across all environments.

Prerequisite:

- `AOM-602-T01` (`/metrics` endpoint available from API service)

---

## API scrape targets

Metrics endpoint:

- `GET /metrics`

Content type:

- `text/plain; version=0.0.4; charset=utf-8`

Exposed core series:

- `ledgerlite_build_info`
- `ledgerlite_process_*`
- `ledgerlite_http_requests_total`
- `ledgerlite_http_request_duration_seconds_*`

---

## Recommended `prometheus.yml` jobs

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "ledgerlite-api-dev"
    metrics_path: /metrics
    scheme: https
    static_configs:
      - targets: ["dev-api.ledgerlite.net"]
        labels:
          env: development
          service: api

  - job_name: "ledgerlite-api-staging"
    metrics_path: /metrics
    scheme: https
    static_configs:
      - targets: ["staging-api.ledgerlite.net"]
        labels:
          env: staging
          service: api

  - job_name: "ledgerlite-api-prod"
    metrics_path: /metrics
    scheme: https
    static_configs:
      - targets: ["api.ledgerlite.net"]
        labels:
          env: production
          service: api
```

If metrics ingress is private/authenticated, add `basic_auth` or proxy auth headers in each job.

---

## Quick validation commands

```bash
curl -s https://dev-api.ledgerlite.net/metrics | head -n 20
curl -s https://staging-api.ledgerlite.net/metrics | head -n 20
curl -s https://api.ledgerlite.net/metrics | head -n 20
```

Expected:

- response includes `# HELP ledgerlite_build_info`
- response includes `ledgerlite_http_requests_total`
- response includes histogram lines for `ledgerlite_http_request_duration_seconds`

---

## Acceptance criteria for `AOM-602-T01`

- API exposes `/metrics` in Prometheus text format.
- Prometheus scrape jobs are defined for dev/staging/prod.
- Environment labels are attached per target.
