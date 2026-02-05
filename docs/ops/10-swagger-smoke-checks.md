# 10 - Swagger Smoke Checks

## Purpose

Validate Swagger availability across environments using a single smoke command.

## Command

From repo root:

```bash
pnpm test:swagger:smoke
```

## Required environment variables

Set one or more API base URLs before running:

- `DEV_API_BASE_URL` (example: `https://dev-api.ledgerlite.net`)
- `STAGING_API_BASE_URL` (example: `https://staging-api.ledgerlite.net`)
- `PROD_API_BASE_URL` (example: `https://api.ledgerlite.net`)

Optional:

- `SWAGGER_PATH` (default: `docs`)
- `DEV_SWAGGER_TOKEN`
- `STAGING_SWAGGER_TOKEN`
- `PROD_SWAGGER_TOKEN`

If a token is provided, the script sends `Authorization: Bearer <token>`.

## What passes

For each configured target, the smoke check passes when:

1. `GET /<SWAGGER_PATH>-json` returns HTTP 200.
2. Response includes valid OpenAPI fields:
   - `openapi`
   - `paths`

## Example (PowerShell)

```powershell
$env:DEV_API_BASE_URL = "https://dev-api.ledgerlite.net"
$env:STAGING_API_BASE_URL = "https://staging-api.ledgerlite.net"
$env:PROD_API_BASE_URL = "https://api.ledgerlite.net"
$env:STAGING_SWAGGER_TOKEN = "replace_with_staging_token"
$env:PROD_SWAGGER_TOKEN = "replace_with_prod_token"
pnpm test:swagger:smoke
```
