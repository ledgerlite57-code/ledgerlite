# 17 - Domains, Environment Isolation, and CI/CD Runbook

## Purpose

Document exactly what was implemented to move from IP-based access to domain-based HTTPS deployments for `development`, `staging`, and `production`, all hosted on one EC2 instance.

As of: **February 4, 2026**

## Environment topology

| Environment | Branch | Public URLs | Server path | Compose project | Internal app ports | Database |
| --- | --- | --- | --- | --- | --- | --- |
| Development | `dev` | `https://dev-app.ledgerlite.net`, `https://dev-api.ledgerlite.net` | `/opt/ledgerlite/dev/repo` | `ledgerlite-dev` | web `23000 -> 3000`, api `24000 -> 4000` | `ledgerlite_dev` |
| Staging | `staging` | `https://staging-app.ledgerlite.net`, `https://staging-api.ledgerlite.net` | `/opt/ledgerlite/staging/repo` | `ledgerlite-staging` | web `13000 -> 3000`, api `14000 -> 4000` | `ledgerlite_staging` |
| Production | `main` | `https://app.ledgerlite.net`, `https://api.ledgerlite.net` | `/opt/ledgerlite/prod/repo` | `ledgerlite-prod` | web `3000 -> 3000`, api `4000 -> 4000` (localhost bind) | `ledgerlite` |

## What was done (chronological)

1. Purchased and activated domain `ledgerlite.net`.
2. Allocated and attached Elastic IP `3.111.225.123` to EC2 instance `i-0472e32dce6498c48`.
3. Added DNS records for:
   - `app`, `api`
   - `staging-app`, `staging-api`
   - `dev-app`, `dev-api`
4. Installed Caddy on EC2 and configured reverse proxy for all six hostnames with automatic TLS.
5. Stopped and disabled Nginx so Caddy exclusively owns ports `80` and `443`.
6. Deployed three isolated Docker Compose stacks (dev/staging/prod) with distinct project names.
7. Updated per-environment URLs:
   - `API_CORS_ORIGIN`
   - `WEB_BASE_URL`
   - `NEXT_PUBLIC_API_BASE_URL`
8. Verified each stack health (`/health`) and each web URL via `curl -I`.
9. Locked AWS security group inbound rules to `22`, `80`, `443` only.
10. Updated deployment automation:
   - `.github/workflows/deploy.yml`
   - `ops/deploy/remote-deploy.sh`
11. Added optional `RESET_DATABASE` behavior:
   - Allowed for `development` and `staging`
   - Explicitly blocked for `production`
12. Synced GitHub Environment secrets (`development`, `staging`, `production`) via `gh` CLI.
13. Rotated and aligned DB credentials so `POSTGRES_PASSWORD` and `DATABASE_URL` password match per environment.

## Caddy routing map

- `app.ledgerlite.net` -> `127.0.0.1:3000`
- `api.ledgerlite.net` -> `127.0.0.1:4000`
- `staging-app.ledgerlite.net` -> `127.0.0.1:13000`
- `staging-api.ledgerlite.net` -> `127.0.0.1:14000`
- `dev-app.ledgerlite.net` -> `127.0.0.1:23000`
- `dev-api.ledgerlite.net` -> `127.0.0.1:24000`

## GitHub environment secrets (required)

For each GitHub Environment (`development`, `staging`, `production`):

- `SSH_HOST`
- `SSH_PORT`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `APP_DIR`
- `DEPLOY_BRANCH`
- `COMPOSE_FILE`
- `ENV_FILE_CONTENT_B64`
- `RESET_DATABASE` (`false` by default; never `true` for production)

Optional:

- `ENV_FILE_PATH` (if set, should be `.env.development`, `.env.staging`, or `.env.prod` based on environment)

## Validation checklist (post-deploy)

Run from local terminal:

```powershell
curl.exe -I https://app.ledgerlite.net
curl.exe -I https://api.ledgerlite.net/health
curl.exe -I https://staging-app.ledgerlite.net
curl.exe -I https://staging-api.ledgerlite.net/health
curl.exe -I https://dev-app.ledgerlite.net
curl.exe -I https://dev-api.ledgerlite.net/health
```

Expected: all return `HTTP/1.1 200`.

## Common failure patterns and fixes

### 1) `POSTGRES_PASSWORD is required`

Cause:
- Env payload decoded on server does not include `POSTGRES_PASSWORD`.

Fix:
- Ensure `.env.*` contains both:
  - `POSTGRES_PASSWORD=<password>`
  - `DATABASE_URL=postgresql://ledgerlite:<same password>@db:5432/<db_name>`
- Recreate `ENV_FILE_CONTENT_B64` and update GitHub environment secret.

### 2) `env file ... not found`

Cause:
- Workflow/script points to wrong env file path.

Fix:
- Ensure env file exists in repo root on server (`.env.development`, `.env.staging`, `.env.prod`) or set `ENV_FILE_PATH` explicitly.
- Re-run workflow.

### 3) `git pull --ff-only` fails due local changes

Cause:
- Dirty working tree on server deploy directory.

Fix:
- `git stash push -u -m "pre-deploy-<timestamp>"`
- Retry deploy.

## Security notes

- Never commit generated secret files (for example `*_env.b64`).
- Treat all printed credentials as compromised and rotate if exposed in logs/chat.
- Keep SSH key only in GitHub Environment Secret, not in repository.

