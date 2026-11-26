#!/usr/bin/env bash
# Prints the links to paste into Better Stack, Sentry and Brevo (they contain a secret: paste
# them only into those websites).
#   sudo bash deploy/monitoring-links.sh
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$DEPLOY_DIR/.env"
if [[ -z "${MONITORING_WEBHOOK_TOKEN:-}" ]]; then
  echo "No monitoring token yet. Run: sudo bash $DEPLOY_DIR/update.sh"
  exit 1
fi
cat <<LINKS

  Uptime check URL (Better Stack → Monitors):
    $APP_URL/api/health?deep=1

  Better Stack webhook (Integrations → Webhook):
    $APP_URL/api/v1/monitoring/better-stack?token=$MONITORING_WEBHOOK_TOKEN

  Sentry webhook (Settings → Integrations → WebHooks):
    $APP_URL/api/v1/monitoring/sentry?token=$MONITORING_WEBHOOK_TOKEN

  Brevo marketing webhook (Contacts → Settings → Webhooks, "Unsubscribed" and "Spam"):
    $APP_URL/api/v1/brevo/webhook?token=$MONITORING_WEBHOOK_TOKEN

LINKS
