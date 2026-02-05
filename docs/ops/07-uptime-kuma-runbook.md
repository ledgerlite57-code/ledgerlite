# 07 - Uptime Kuma Runbook

## Scope

Define uptime checks and alerting for LedgerLite web and API endpoints per environment.

Task mapping:

- `AOM-606-T01`

---

## Monitor set

Create the following HTTP monitors in Uptime Kuma:

### Development

- `dev-web-root` -> `https://dev-app.ledgerlite.net/`
- `dev-api-health` -> `https://dev-api.ledgerlite.net/health`
- `dev-auth-register-options` -> `https://dev-api.ledgerlite.net/auth/register` (method: `OPTIONS`)
- `dev-swagger` -> `https://dev-api.ledgerlite.net/docs`

### Staging

- `staging-web-root` -> `https://staging-app.ledgerlite.net/`
- `staging-api-health` -> `https://staging-api.ledgerlite.net/health`
- `staging-auth-register-options` -> `https://staging-api.ledgerlite.net/auth/register` (method: `OPTIONS`)
- `staging-swagger` -> `https://staging-api.ledgerlite.net/docs`

### Production

- `prod-web-root` -> `https://app.ledgerlite.net/`
- `prod-api-health` -> `https://api.ledgerlite.net/health`
- `prod-auth-register-options` -> `https://api.ledgerlite.net/auth/register` (method: `OPTIONS`)
- `prod-swagger` -> `https://api.ledgerlite.net/docs`

---

## Monitor settings (baseline)

- Interval: `60s`
- Retry interval: `30s`
- Max retries: `3`
- Request timeout: `10s`
- Accepted status codes:
  - web root: `200-399`
  - health endpoint: `200`
  - auth options: `200-299`
  - swagger: `200-399` (or `401/403` if explicitly protected)

---

## Alert routing

Configure notification channels:

- Primary: email
- Secondary: Slack/Discord webhook (optional)

Trigger alerts on:

- monitor down
- monitor recovery
- latency threshold breach (p95 > 2s for 5 minutes)

---

## Tagging

Use tags for clean filtering:

- `env:dev`, `env:staging`, `env:prod`
- `service:web`, `service:api`, `service:auth`, `service:docs`

---

## Validation checklist

1. All 12 monitors exist (4 per environment).
2. Monitors grouped by environment dashboard.
3. Alert channel test message succeeds.
4. Simulated outage generates alert and recovery notification.
