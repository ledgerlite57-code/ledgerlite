#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

MODE="${1:-quick}"
if [ $# -gt 0 ]; then
  shift
fi

TUNNEL_NAME="${TUNNEL_NAME:-ledgerlite-dev}"
DOMAIN="${DOMAIN:-}"
WEB_HOST="${WEB_HOST:-ledgerlite}"
API_HOST="${API_HOST:-ledgerlite-api}"
WEB_PORT="${WEB_PORT:-3000}"
API_PORT="${API_PORT:-4000}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
CONFIG_FILE="${CONFIG_FILE:-$HOME/.cloudflared/ledgerlite-config.yml}"
RUN_TUNNEL="${RUN_TUNNEL:-true}"

usage() {
  cat <<'USAGE'
Usage:
  cloudflared-tunnel.sh quick [--env-file PATH] [--web-port 3000] [--api-port 4000]
  cloudflared-tunnel.sh named --domain example.com [--tunnel-name NAME] [--web-host SUB] [--api-host SUB] [--env-file PATH] [--config PATH] [--no-run]

Examples:
  ./ops/tunnel/cloudflared-tunnel.sh quick
  ./ops/tunnel/cloudflared-tunnel.sh named --domain example.com --tunnel-name ledgerlite --web-host app --api-host api
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain)
      DOMAIN="$2"
      shift 2
      ;;
    --tunnel-name)
      TUNNEL_NAME="$2"
      shift 2
      ;;
    --web-host)
      WEB_HOST="$2"
      shift 2
      ;;
    --api-host)
      API_HOST="$2"
      shift 2
      ;;
    --web-port)
      WEB_PORT="$2"
      shift 2
      ;;
    --api-port)
      API_PORT="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --config)
      CONFIG_FILE="$2"
      shift 2
      ;;
    --no-run)
      RUN_TUNNEL="false"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown arg: $1"
      usage
      exit 1
      ;;
  esac
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1"
    exit 1
  fi
}

ensure_env_file() {
  if [ ! -f "$ENV_FILE" ]; then
    if [ -f "$ROOT_DIR/.env.example" ]; then
      cp "$ROOT_DIR/.env.example" "$ENV_FILE"
    else
      touch "$ENV_FILE"
    fi
  fi
}

backup_env() {
  if [ -f "$ENV_FILE" ]; then
    cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d%H%M%S)"
  fi
}

upsert_env() {
  local key="$1"
  local value="$2"
  local file="$3"
  local tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { found = 0 }
    $0 ~ "^" k "=" { print k "=" v; found = 1; next }
    { print }
    END { if (!found) print k "=" v }
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

update_env_for_urls() {
  local web_url="$1"
  local api_url="$2"
  ensure_env_file
  backup_env
  upsert_env "API_CORS_ORIGIN" "$web_url" "$ENV_FILE"
  upsert_env "WEB_BASE_URL" "$web_url" "$ENV_FILE"
  upsert_env "NEXT_PUBLIC_API_BASE_URL" "$api_url" "$ENV_FILE"
}

wait_for_url() {
  local log_file="$1"
  local label="$2"
  local i
  for i in $(seq 1 60); do
    local url
    url="$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$log_file" | head -n 1)"
    if [ -n "$url" ]; then
      echo "$url"
      return 0
    fi
    sleep 1
  done
  echo "Failed to detect $label tunnel URL. Check logs: $log_file"
  return 1
}

quick_mode() {
  require_cmd cloudflared

  local web_log
  local api_log
  web_log="$(mktemp)"
  api_log="$(mktemp)"

  cloudflared tunnel --no-autoupdate --loglevel info --url "http://localhost:${WEB_PORT}" >"$web_log" 2>&1 &
  local web_pid=$!
  cloudflared tunnel --no-autoupdate --loglevel info --url "http://localhost:${API_PORT}" >"$api_log" 2>&1 &
  local api_pid=$!

  cleanup() {
    kill "$web_pid" "$api_pid" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT

  local web_url
  local api_url
  web_url="$(wait_for_url "$web_log" "web")"
  api_url="$(wait_for_url "$api_log" "api")"

  update_env_for_urls "$web_url" "$api_url"

  echo "Web URL: $web_url"
  echo "API URL: $api_url"
  echo "Updated env: $ENV_FILE"
  echo "Tunnels are running. Press Ctrl+C to stop."

  wait
}

get_tunnel_id() {
  cloudflared tunnel list 2>/dev/null | awk -v name="$TUNNEL_NAME" 'NR > 1 && $2 == name { print $1; exit }'
}

named_mode() {
  require_cmd cloudflared

  if [ -z "$DOMAIN" ]; then
    echo "Missing required --domain"
    usage
    exit 1
  fi

  if [ ! -f "$HOME/.cloudflared/cert.pem" ]; then
    echo "No Cloudflare cert found. Running: cloudflared tunnel login"
    cloudflared tunnel login
  fi

  local tunnel_id
  tunnel_id="$(get_tunnel_id)"
  if [ -z "$tunnel_id" ]; then
    cloudflared tunnel create "$TUNNEL_NAME"
    tunnel_id="$(get_tunnel_id)"
  fi

  if [ -z "$tunnel_id" ]; then
    echo "Failed to find or create tunnel: $TUNNEL_NAME"
    exit 1
  fi

  local cred_file="$HOME/.cloudflared/${tunnel_id}.json"
  if [ ! -f "$cred_file" ]; then
    echo "Missing credentials file: $cred_file"
    exit 1
  fi

  local web_hostname="${WEB_HOST}.${DOMAIN}"
  local api_hostname="${API_HOST}.${DOMAIN}"

  mkdir -p "$(dirname "$CONFIG_FILE")"
  cat <<EOF_CONFIG > "$CONFIG_FILE"
tunnel: $tunnel_id
credentials-file: $cred_file
ingress:
  - hostname: $web_hostname
    service: http://localhost:${WEB_PORT}
  - hostname: $api_hostname
    service: http://localhost:${API_PORT}
  - service: http_status:404
EOF_CONFIG

  set +e
  cloudflared tunnel route dns "$TUNNEL_NAME" "$web_hostname"
  local web_route_status=$?
  cloudflared tunnel route dns "$TUNNEL_NAME" "$api_hostname"
  local api_route_status=$?
  set -e

  if [ $web_route_status -ne 0 ] || [ $api_route_status -ne 0 ]; then
    echo "DNS route setup returned a non-zero status. If the routes already exist, this is safe to ignore."
  fi

  local web_url="https://$web_hostname"
  local api_url="https://$api_hostname"
  update_env_for_urls "$web_url" "$api_url"

  echo "Web URL: $web_url"
  echo "API URL: $api_url"
  echo "Updated env: $ENV_FILE"
  echo "Config: $CONFIG_FILE"

  if [ "$RUN_TUNNEL" = "true" ]; then
    cloudflared tunnel --config "$CONFIG_FILE" run "$TUNNEL_NAME"
  else
    echo "Run: cloudflared tunnel --config \"$CONFIG_FILE\" run \"$TUNNEL_NAME\""
  fi
}

case "$MODE" in
  quick)
    quick_mode
    ;;
  named)
    named_mode
    ;;
  *)
    echo "Unknown mode: $MODE"
    usage
    exit 1
    ;;
esac
