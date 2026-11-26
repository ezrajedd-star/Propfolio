#!/usr/bin/env bash
# Propfolio — update to the newest version of this branch and restart. Data is kept.
#   sudo bash deploy/update.sh
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DEPLOY_DIR/.."
if ! git symbolic-ref -q HEAD >/dev/null; then
  echo "This server is updated by the release pipeline (GitHub → Actions → Release)."
  echo "To update by hand anyway: sudo bash deploy/release.sh deploy <commit>"
  exit 1
fi
echo "▶ Backing up first"
bash "$DEPLOY_DIR/backup.sh"
echo "▶ Getting the newest version"
git pull --ff-only
cd "$DEPLOY_DIR"
# Newer versions need a few more settings; add any that are missing (secrets are made here).
if ! grep -q '^MONITORING_WEBHOOK_TOKEN=' .env; then
  echo "MONITORING_WEBHOOK_TOKEN=$(openssl rand -hex 24)" >> .env
fi
for agent in SUPPORT GROWTH DIGEST ENGINEERING; do
  if ! grep -q "^AGENT_KEY_${agent}=" .env; then
    echo "AGENT_KEY_${agent}=$(openssl rand -hex 24)" >> .env
  fi
done
bash "$DEPLOY_DIR/ops-cron.sh"
echo "▶ Rebuilding and restarting (database changes are applied automatically)"
docker compose build
docker compose up -d
docker image prune -f >/dev/null
echo "✔ Updated. $(git -C "$DEPLOY_DIR/.." log -1 --format='Now on: %s (%cd)' --date=short)"
