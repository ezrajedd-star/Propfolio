# Shared by watchdog.sh, restore-check.sh and release.sh. Reads only the settings they need
# from deploy/.env (root-only) and talks to Propfolio on this server, never over the internet.
DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
STATE_DIR=/var/lib/propfolio
mkdir -p "$STATE_DIR" && chmod 700 "$STATE_DIR"
if [[ -f "$DEPLOY_DIR/.env" ]]; then
  while IFS='=' read -r key value; do
    [[ "$key" == "APP_URL" || "$key" == "MONITORING_WEBHOOK_TOKEN" ]] || continue
    value="${value%[\"\']}"
    export "$key=${value#[\"\']}"
  done < "$DEPLOY_DIR/.env"
fi
APP_HOST="${APP_URL#https://}"
APP_HOST="${APP_HOST%%/*}"

# curl to this server's own Caddy (no DNS, no trip over the internet).
local_curl() {
  curl -fsS -m 10 --resolve "$APP_HOST:443:127.0.0.1" "$@"
}

# POST JSON to the ops API. Never prints the token.
ops_post() {
  local path="$1" json="$2"
  local_curl -X POST -H "content-type: application/json" \
    -H "x-monitoring-token: ${MONITORING_WEBHOOK_TOKEN:-}" \
    --data "$json" "https://$APP_HOST/api/v1/ops/$path" >/dev/null || true
}

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr -d '\n'; }
