#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <development|staging|production>"
  exit 1
fi

ENVIRONMENT="$1"

case "$ENVIRONMENT" in
  development)
    APP_DIR="${APP_DIR:-/opt/ledgerlite/dev/repo}"
    BRANCH="${BRANCH:-dev}"
    COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.development.yml}"
    ;;
  staging)
    APP_DIR="${APP_DIR:-/opt/ledgerlite/staging/repo}"
    BRANCH="${BRANCH:-staging}"
    COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
    ;;
  production)
    APP_DIR="${APP_DIR:-/opt/ledgerlite/prod/repo}"
    BRANCH="${BRANCH:-main}"
    COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
    ;;
  *)
    echo "Invalid environment: $ENVIRONMENT"
    exit 1
    ;;
esac

cd "$APP_DIR"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

docker compose -f "$COMPOSE_FILE" up -d --build --remove-orphans
docker compose -f "$COMPOSE_FILE" exec -T api pnpm exec prisma migrate deploy
docker image prune -f
