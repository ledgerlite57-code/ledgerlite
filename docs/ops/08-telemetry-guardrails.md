# 08 - Telemetry Guardrails

## Scope

Define production-safe defaults for logs, traces, metrics, and retention/cardinality limits.

Task mapping:

- `AOM-607-T01`

---

## Environment defaults

### Development

- API request log level: `debug`
- Trace sampling ratio: `1.0`
- Metrics scrape interval: `15s`
- Retention target:
  - metrics: 7 days
  - logs: 7 days
  - traces: 3 days

### Staging

- API request log level: `info`
- Trace sampling ratio: `0.2`
- Metrics scrape interval: `15s`
- Retention target:
  - metrics: 14 days
  - logs: 14 days
  - traces: 7 days

### Production

- API request log policy:
  - `error` for 5xx/unhandled errors
  - `warn` for 4xx
  - successful 2xx/3xx request logs suppressed (`silent`)
- Trace sampling ratio: `0.05`
- Metrics scrape interval: `30s` (or `15s` if capacity allows)
- Retention target:
  - metrics: 30 days
  - logs: 30 days
  - traces: 14 days

---

## Cardinality and payload limits

Do not use high-cardinality labels in metrics:

- no raw `userId` in metrics labels
- no raw `orgId` in metrics labels
- no full dynamic URLs with IDs in metrics labels

Allowed labels in API metrics:

- `method`
- normalized `route`
- `status`

Logs:

- redact credentials and tokens
- never log full auth payloads
- do not log SMTP secrets

---

## Alert and volume guardrails

- Alert only on sustained conditions:
  - 5xx rate over threshold for 5 minutes
  - p95 latency above threshold for 5 minutes
- Avoid page fatigue:
  - route warning-level alerts to async channel
  - reserve paging for critical outages

---

## Validation checklist

1. Production successful request logs are suppressed.
2. 4xx and 5xx requests still produce warning/error logs.
3. Trace sampling follows environment defaults unless explicitly overridden.
4. Metrics labels remain low-cardinality.
5. Retention limits are set and reviewed monthly.
