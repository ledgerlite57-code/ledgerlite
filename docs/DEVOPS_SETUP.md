# DevOps Setup (GitHub Branching + CI/CD + AWS EC2)

This runbook sets up:
- Branch strategy: `dev` -> `staging` -> `main`
- CI on pull requests and pushes
- CD to EC2 through GitHub Actions + SSH
- Dockerized environments on server

## 1) Branch strategy and commands

Create environment branches once:

```bash
git checkout main
git pull origin main

git checkout -b dev
git push -u origin dev

git checkout -b staging
git push -u origin staging

git checkout main
```

Feature branch flow:

```bash
git checkout dev
git pull origin dev
git checkout -b feature/<ticket-or-scope>
git push -u origin feature/<ticket-or-scope>
```

Promotion flow:

```bash
# dev -> staging
git checkout staging
git pull origin staging
git merge --no-ff dev -m "chore: promote dev to staging"
git push origin staging

# staging -> main
git checkout main
git pull origin main
git merge --no-ff staging -m "chore: promote staging to main"
git push origin main
```

## 2) GitHub branch protection

Create branch rules for `dev`, `staging`, `main`:
- Require pull request before merge
- Require status checks to pass (CI)
- Require conversation resolution
- Disallow force pushes/deletes
- Require approvals on `main` (recommended)

## 3) GitHub Actions in this repo

Workflows:
- `.github/workflows/ci.yml`
  - Runs `lint`, `typecheck`, and `build`
  - Triggers on push/PR for `dev`, `staging`, `main` (+ feature/hotfix pushes)
- `.github/workflows/deploy.yml`
  - Auto deploy on push:
    - `dev` -> `development` environment
    - `staging` -> `staging` environment
    - `main` -> `production` environment
  - Also supports manual `workflow_dispatch`

## 4) GitHub environments and required secrets

Create GitHub environments:
- `development`
- `staging`
- `production`

For each environment, add these secrets:
- `SSH_HOST` - EC2 public IP or DNS
- `SSH_PORT` - usually `22`
- `SSH_USER` - usually `ubuntu`
- `SSH_PRIVATE_KEY` - private key content used for SSH
- `APP_DIR` - absolute path to repo on server
- `DEPLOY_BRANCH` - `dev`, `staging`, or `main`
- `COMPOSE_FILE` - one of:
  - `docker-compose.development.yml`
  - `docker-compose.staging.yml`
  - `docker-compose.prod.yml`

## 5) Server folder structure

Recommended on EC2:

```bash
/opt/ledgerlite/dev/repo
/opt/ledgerlite/staging/repo
/opt/ledgerlite/prod/repo
```

Clone repository into each folder and checkout correct branch:

```bash
git clone <repo-url> /opt/ledgerlite/dev/repo
git clone <repo-url> /opt/ledgerlite/staging/repo
git clone <repo-url> /opt/ledgerlite/prod/repo

cd /opt/ledgerlite/dev/repo && git checkout dev
cd /opt/ledgerlite/staging/repo && git checkout staging
cd /opt/ledgerlite/prod/repo && git checkout main
```

## 6) Environment files on server

Copy examples and edit real values:

```bash
cd /opt/ledgerlite/dev/repo && cp .env.development.example .env.development
cd /opt/ledgerlite/staging/repo && cp .env.staging.example .env.staging
cd /opt/ledgerlite/prod/repo && cp .env.prod.example .env.prod
```

Set strong secrets and correct domains in each env file:
- `API_JWT_SECRET`
- `API_JWT_REFRESH_SECRET`
- `DATABASE_URL`
- `NEXT_PUBLIC_API_BASE_URL`
- `API_CORS_ORIGIN`

Note: database password in `DATABASE_URL` must match `POSTGRES_PASSWORD` used by compose (export `POSTGRES_PASSWORD` before deploy or update compose defaults).

## 7) First-time manual deploy (sanity check)

```bash
cd /opt/ledgerlite/prod/repo
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec -T api pnpm exec prisma migrate deploy
```

Repeat similarly for staging/development with their compose files.

## 8) Nginx upstream ports for each environment

Use these container host ports:
- Development: web `23000`, api `24000`
- Staging: web `13000`, api `14000`
- Production: web `3000`, api `4000`

Point each domain/subdomain to the matching upstream in Nginx.

## 9) Optional server-side deploy helper

Script template:
- `ops/deploy/remote-deploy.sh`

Usage:

```bash
bash ops/deploy/remote-deploy.sh production
bash ops/deploy/remote-deploy.sh staging
bash ops/deploy/remote-deploy.sh development
```

## 10) Final verification checklist

- CI passes on PR to `dev`
- Merge to `dev` triggers deployment to development
- Merge to `staging` triggers deployment to staging
- Merge to `main` triggers deployment to production
- Health checks return success (`/health`)
- Login and core flows work from web app
