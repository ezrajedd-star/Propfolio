#!/usr/bin/env bash
# Propfolio — update to the newest version of this branch and restart. Data is kept.
#   sudo bash deploy/update.sh
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DEPLOY_DIR/.."
echo "▶ Backing up first"
bash "$DEPLOY_DIR/backup.sh"
echo "▶ Getting the newest version"
git pull --ff-only
cd "$DEPLOY_DIR"
echo "▶ Rebuilding and restarting (database changes are applied automatically)"
docker compose build
docker compose up -d
docker image prune -f >/dev/null
echo "✔ Updated. $(git -C "$DEPLOY_DIR/.." log -1 --format='Now on: %s (%cd)' --date=short)"
