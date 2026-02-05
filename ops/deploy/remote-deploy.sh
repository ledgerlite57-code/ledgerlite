#!/usr/bin/env bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <development|staging|production>"
  exit 1
fi

ENVIRONMENT="$1"

is_true() {
  case "${1:-}" in
    1 | true | TRUE | yes | YES | y | Y | on | ON)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

case "$ENVIRONMENT" in
  development)
    APP_DIR="${APP_DIR:-/opt/ledgerlite/dev/repo}"
    BRANCH="${BRANCH:-dev}"
    COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.development.yml}"
    ENV_FILE="${ENV_FILE:-../.env.development}"
    LEGACY_ENV_FILE=".env.development"
    COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ledgerlite-dev}"
    RESET_DATABASE_ALLOWED="true"
    ;;
  staging)
    APP_DIR="${APP_DIR:-/opt/ledgerlite/staging/repo}"
    BRANCH="${BRANCH:-staging}"
    COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
    ENV_FILE="${ENV_FILE:-../.env.staging}"
    LEGACY_ENV_FILE=".env.staging"
    COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ledgerlite-staging}"
    RESET_DATABASE_ALLOWED="true"
    ;;
  production)
    APP_DIR="${APP_DIR:-/opt/ledgerlite/prod/repo}"
    BRANCH="${BRANCH:-main}"
    COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
    ENV_FILE="${ENV_FILE:-../.env.prod}"
    LEGACY_ENV_FILE=".env.prod"
    COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-ledgerlite-prod}"
    RESET_DATABASE_ALLOWED="false"
    ;;
  *)
    echo "Invalid environment: $ENVIRONMENT"
    exit 1
    ;;
esac

cd "$APP_DIR"
git fetch origin
git checkout "$BRANCH"
if ! git diff --quiet || ! git diff --cached --quiet; then
  git stash push -m "ci-auto-stash-before-deploy" || true
fi
PREV_HEAD="$(git rev-parse HEAD)"
git pull --ff-only origin "$BRANCH"
NEW_HEAD="$(git rev-parse HEAD)"

if [ -n "${ENV_FILE_CONTENT_B64:-}" ]; then
  mkdir -p "$(dirname "$ENV_FILE")"
  printf '%s' "$ENV_FILE_CONTENT_B64" | base64 -d > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
fi

if [ ! -f "$ENV_FILE" ]; then
  if [ -n "${LEGACY_ENV_FILE:-}" ] && [ -f "$LEGACY_ENV_FILE" ]; then
    ENV_FILE="$LEGACY_ENV_FILE"
  fi
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE"
  exit 1
fi

set -a
. "$ENV_FILE"
set +a
export NEXT_PUBLIC_APP_VERSION="${NEXT_PUBLIC_APP_VERSION:-$(git rev-parse --short HEAD)}"

if is_true "${RESET_DATABASE:-false}"; then
  if [ "$RESET_DATABASE_ALLOWED" != "true" ]; then
    echo "RESET_DATABASE=true is not allowed for $ENVIRONMENT"
    exit 1
  fi
  echo "RESET_DATABASE=true: dropping existing volumes for $ENVIRONMENT"
  docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down -v --remove-orphans || true
fi

BUILD_API="false"
BUILD_WEB="false"

if [ "$PREV_HEAD" != "$NEW_HEAD" ]; then
  CHANGED_FILES="$(git diff --name-only "$PREV_HEAD" "$NEW_HEAD")"

  if printf '%s\n' "$CHANGED_FILES" | grep -Eq '^(apps/api/|packages/shared/|packages/config/|apps/api/Dockerfile|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|turbo.json)'; then
    BUILD_API="true"
  fi

  if printf '%s\n' "$CHANGED_FILES" | grep -Eq '^(apps/web/|packages/shared/|packages/config/|apps/web/Dockerfile|package.json|pnpm-lock.yaml|pnpm-workspace.yaml|turbo.json)'; then
    BUILD_WEB="true"
  fi
fi

if [ "$BUILD_API" = "true" ] || [ "$BUILD_WEB" = "true" ]; then
  SERVICES=()
  if [ "$BUILD_API" = "true" ]; then SERVICES+=("api"); fi
  if [ "$BUILD_WEB" = "true" ]; then SERVICES+=("web"); fi
  echo "Building changed services: ${SERVICES[*]}"
  docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build "${SERVICES[@]}"
  docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans
else
  echo "No deploy-critical app changes detected between $PREV_HEAD and $NEW_HEAD; reusing existing images."
  docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --remove-orphans
fi

docker compose -p "$COMPOSE_PROJECT_NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T api pnpm exec prisma migrate deploy
curl -fsS "http://127.0.0.1:${API_PORT:-4000}/health" >/dev/null
if is_true "${PRUNE_IMAGES:-false}"; then
  docker image prune -f
fi
