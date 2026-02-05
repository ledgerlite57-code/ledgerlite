# 09 - Alert Routing and On-Call Runbook

## Scope

Define alert routing, severity model, and incident response workflow for LedgerLite monitoring.

Task mapping:

- `AOM-607-T02`

---

## Severity model

- `critical`
  - API down
  - DB unavailable
  - sustained 5xx spike
  - customer-facing outage
- `warning`
  - latency degradation
  - elevated 4xx/5xx trend
  - storage nearing threshold

---

## Routing matrix

### Development

- warnings: team channel only
- critical: team channel + email

### Staging

- warnings: team channel
- critical: team channel + email

### Production

- warnings: team channel
- critical: team channel + email + paging (if available)

---

## Alert channels

- Email distribution list (required)
- Slack/Discord webhook (recommended)
- PagerDuty/Opsgenie (optional for critical prod incidents)

---

## Mandatory alert rules

1. API `/health` down for 2 minutes (`critical`)
2. 5xx error rate > 5% for 5 minutes (`critical`)
3. p95 latency above SLO for 5 minutes (`warning`)
4. Disk usage > 85% for 10 minutes (`warning`)
5. DB readiness failure for 2 minutes (`critical`)

---

## On-call procedure

1. Acknowledge alert.
2. Confirm impacted environment and service.
3. Correlate:
   - Grafana metrics
   - Loki logs (by `requestId`/`traceId`)
   - Tempo traces (if sampled)
   - Sentry issues
4. Mitigate:
   - rollback deploy, restart service, or apply hotfix.
5. Validate recovery.
6. Close alert and post incident note.

---

## Incident note template

- timestamp (UTC)
- environment
- impacted endpoint(s)
- user impact summary
- root cause
- mitigation
- follow-up actions

---

## Validation checklist

1. Each environment has active alert contact points.
2. Test alert successfully delivered to all configured channels.
3. `critical` alerts are distinguishable from `warning`.
4. Runbook link is available in alert annotations.
