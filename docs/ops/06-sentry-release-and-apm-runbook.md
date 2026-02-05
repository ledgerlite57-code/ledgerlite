# 06 - Sentry Release and APM Runbook

## Scope

Configure Sentry release tagging and performance sampling for API and Web.

Task mapping:

- `AOM-605-T01`

---

## API configuration

API Sentry config source: `apps/api/src/main.ts`

Environment variables:

- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT` (`development|staging|production`)
- `SENTRY_RELEASE` (optional; fallback `api@<NEXT_PUBLIC_APP_VERSION>`)
- `SENTRY_TRACES_SAMPLE_RATE` (optional `0..1`)
- `SENTRY_PROFILES_SAMPLE_RATE` (optional `0..1`)

Default trace sampling if unset:

- development: `1.0`
- staging: `0.2`
- production: `0.05`

Tags attached on API events:

- `service=api`
- `release=<resolved release>`
- `path`
- `requestId`
- `traceId`

---

## Web configuration

Web Sentry config source:

- `apps/web/sentry.client.config.ts`
- `apps/web/sentry.server.config.ts`
- `apps/web/src/lib/sentry-config.ts`

Environment variables:

- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (optional)
- `NEXT_PUBLIC_SENTRY_RELEASE` (optional; fallback `web@<NEXT_PUBLIC_APP_VERSION>`)
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` (optional `0..1`)
- `NEXT_PUBLIC_APP_VERSION`

Default trace sampling if unset:

- development: `1.0`
- staging: `0.2`
- production: `0.05`

Tags attached on Web events:

- `service=web`
- `runtime=client|server`
- `appVersion=<NEXT_PUBLIC_APP_VERSION>`

---

## Validation checklist

1. Trigger API test error at `/health/sentry-test` in non-production.
2. Confirm Sentry issue includes tags:
   - `service=api`
   - `requestId`
   - `traceId`
3. Trigger a web client error and confirm:
   - release is `web@<version>`
   - environment is correct
4. In Sentry Performance, confirm sampled transactions appear with expected rate per environment.
