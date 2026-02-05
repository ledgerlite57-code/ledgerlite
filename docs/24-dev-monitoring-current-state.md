# 24 - DEV Monitoring Current State

## Purpose

Capture what is already working in the DEV monitoring setup, how to verify it quickly, and what remains before we call monitoring "complete".

---

## Environment and endpoints

- Server: EC2 `3.111.225.123`
- App (DEV): `https://dev-app.ledgerlite.net`
- API (DEV): `https://dev-api.ledgerlite.net`
- Monitoring UI (DEV): `https://monitor-dev.ledgerlite.net`

---

## Implemented so far (DEV)

### 1) Protected monitoring ingress (Caddy)

- `monitor-dev.ledgerlite.net` is reverse-proxied to Grafana on `127.0.0.1:3300`.
- Basic auth is enabled at Caddy for the monitoring host.
- Caddy validation and reload are working.

### 2) Grafana runtime (DEV)

- Container `monitor-grafana-dev` is running.
- Grafana health endpoint is healthy (`/api/health` returns database `ok`).
- UI login page is reachable after Caddy auth.

### 3) API metrics exposure (DEV)

- API metrics endpoint is active: `https://dev-api.ledgerlite.net/metrics`.
- Prometheus-format metrics are exposed (examples: request counters, latency histogram, process memory, uptime).

### 4) Dashboard baseline

- A DEV dashboard is created and rendering live API metrics.
- Baseline cards include:
  - Request rate
  - 5xx error rate
  - P95 latency
  - Memory RSS
  - Throughput by status
  - p50/p95/p99 latency trend

---

## Quick verification checklist (DEV)

Run from local PowerShell:

```powershell
Resolve-DnsName monitor-dev.ledgerlite.net -Type A -Server 1.1.1.1
curl.exe -I https://monitor-dev.ledgerlite.net
curl.exe -I https://dev-app.ledgerlite.net
curl.exe -I https://dev-api.ledgerlite.net/health
curl.exe -s https://dev-api.ledgerlite.net/metrics | Select-Object -First 20
```

Run on EC2:

```bash
sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'monitor-grafana-dev|ledgerlite-dev-api-1|ledgerlite-dev-web-1|NAMES'
curl -sS http://127.0.0.1:3300/api/health
curl -sS -o /tmp/dev_metrics.txt -w "%{http_code}\n" http://127.0.0.1:24000/metrics
head -n 20 /tmp/dev_metrics.txt
sudo journalctl -u caddy --since "15 min ago" --no-pager | grep -Ei 'error|warn|502|upstream' || true
```

Expected:

- Monitoring host returns `401` without auth (Caddy challenge).
- Monitoring host returns `302 /login` after successful auth.
- App/API health endpoints return `200`.
- Metrics endpoint returns Prometheus text payload.

---

## What is not complete yet

To move from "working dashboard" to "production-grade monitoring", remaining items are:

1. Prometheus service per environment (DEV/STAGE/PROD) with persistent scrape config.
2. Alert rules + contact points (email/Slack) and notification policy.
3. Uptime checks (external synthetic checks) for app/api/monitor/swagger endpoints.
4. Centralized logs (Loki + promtail).
5. Tracing pipeline (OpenTelemetry + Tempo/Jaeger) and correlation with logs/metrics.

---

## Operational notes for developers

- Low-traffic DEV can show sparse charts; this is normal.
- `No data` on 5xx panel can mean "no errors happened" (good), not necessarily broken query.
- Keep auth credentials out of git; store in secure secret manager / environment secrets.
- Prefer script-based provisioning for repeatability across environments.

---

## Next planned work item

- Continue with Epic 8 (`US-AOM-801`): introduce `LEDGERLITE_PRODUCT_MANAGER` global role and permission wiring.
