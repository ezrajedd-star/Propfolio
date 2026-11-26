#!/usr/bin/env bash
# Propfolio watchdog — runs every minute from cron (set up by setup.sh / update.sh).
#
# Only runbook-safe actions: it restarts the web app or the background jobs, never the database,
# never deletes anything, and never more than once every 15 minutes per part (no restart loops).
#   1. Restarts asked for on System health in the console.
#   2. The web app not answering 3 checks in a row → restart it.
#   3. The background jobs stopped (the deep health check fails while the app answers) → restart.
# Each restart is reported back to System health. Log: /var/log/propfolio-watchdog.log
set -uo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-ops.sh
source "$DEPLOY_DIR/lib-ops.sh"
cd "$DEPLOY_DIR"
COOLDOWN=900

log() { echo "$(date -u +%FT%TZ) $*"; }

restart() {  # restart <web|worker> <request-id or empty> <why>
  local svc="$1" id="$2" why="$3" mark="$STATE_DIR/last-restart-$1" kind ok result
  kind=$([[ "$svc" == web ]] && echo RESTART_WEB || echo RESTART_WORKER)
  if [[ -z "$id" && -f "$mark" ]] && (( $(date +%s) - $(cat "$mark") < COOLDOWN )); then
    log "skip $svc restart ($why): restarted less than 15 minutes ago"
    return
  fi
  date +%s > "$mark"
  if docker compose restart "$svc" >/dev/null 2>&1; then ok=true; result="$svc restarted"; else ok=false; result="docker could not restart $svc"; fi
  log "$result ($why)"
  # Give the web app time to come back before reporting through it.
  for _ in 1 2 3 4 5 6; do local_curl "https://$APP_HOST/api/health" >/dev/null 2>&1 && break; sleep 10; done
  if [[ -n "$id" ]]; then
    ops_post result "{\"id\":\"$id\",\"ok\":$ok,\"result\":\"$(json_escape "$result")\"}"
  else
    ops_post result "{\"kind\":\"$kind\",\"ok\":$ok,\"result\":\"$(json_escape "$result: $why")\"}"
  fi
}

# 1. Restarts asked for in the console.
if requests=$(local_curl -H "x-monitoring-token: ${MONITORING_WEBHOOK_TOKEN:-}" "https://$APP_HOST/api/v1/ops/requests" 2>/dev/null); then
  echo "0" > "$STATE_DIR/web-fails"
  while read -r id kind; do
    [[ -n "$id" ]] || continue
    case "$kind" in
      RESTART_WEB) restart web "$id" "asked for in the console" ;;
      RESTART_WORKER) restart worker "$id" "asked for in the console" ;;
    esac
  done < <(printf '%s' "$requests" | grep -o '"id":"[0-9a-f-]*","kind":"[A-Z_]*"' | sed 's/"id":"\([^"]*\)","kind":"\([^"]*\)"/\1 \2/')
  # 3. Background jobs stopped while the app answers.
  if ! local_curl "https://$APP_HOST/api/health?deep=1" >/dev/null 2>&1; then
    restart worker "" "background jobs stopped checking in"
  fi
else
  # 2. The web app isn't answering.
  fails=$(( $(cat "$STATE_DIR/web-fails" 2>/dev/null || echo 0) + 1 ))
  echo "$fails" > "$STATE_DIR/web-fails"
  log "web app not answering ($fails in a row)"
  if (( fails >= 3 )); then
    if docker compose exec -T postgres pg_isready -U propfolio -d propfolio >/dev/null 2>&1; then
      restart web "" "not answering 3 checks in a row"
      echo "0" > "$STATE_DIR/web-fails"
    else
      log "database not answering: not restarting anything (outage runbook step 3)"
    fi
  fi
fi
