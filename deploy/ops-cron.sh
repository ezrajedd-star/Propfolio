#!/usr/bin/env bash
# Schedules the watchdog (every minute) and the monthly backup-restore check (20:30 UTC on the
# 1st = 04:30 Manila on the 2nd, two hours after that night's backup).
# Called by setup.sh and update.sh; safe to run again.
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "$DEPLOY_DIR/watchdog.sh" "$DEPLOY_DIR/restore-check.sh" "$DEPLOY_DIR/release.sh"
cat > /etc/cron.d/propfolio-ops <<CRON
* * * * * root $DEPLOY_DIR/watchdog.sh >> /var/log/propfolio-watchdog.log 2>&1
30 20 1 * * root $DEPLOY_DIR/restore-check.sh >> /var/log/propfolio-restore-check.log 2>&1
CRON
