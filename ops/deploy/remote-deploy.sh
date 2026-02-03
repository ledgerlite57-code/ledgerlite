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
    ENV_FILE="${ENV_FILE:-.env.development}"
    ;;
  staging)
    APP_DIR="${APP_DIR:-/opt/ledgerlite/staging/repo}"
    BRANCH="${BRANCH:-staging}"
    COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
    ENV_FILE="${ENV_FILE:-.env.staging}"
    ;;
  production)
    APP_DIR="${APP_DIR:-/opt/ledgerlite/prod/repo}"
    BRANCH="${BRANCH:-main}"
    COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
    ENV_FILE="${ENV_FILE:-.env.prod}"
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

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

set -a
. "./$ENV_FILE"
set +a
export NEXT_PUBLIC_APP_VERSION="${NEXT_PUBLIC_APP_VERSION:-$(git rev-parse --short HEAD)}"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build --remove-orphans
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T api pnpm exec prisma migrate deploy
curl -fsS "http://127.0.0.1:${API_PORT:-4000}/health" >/dev/null
docker image prune -f
