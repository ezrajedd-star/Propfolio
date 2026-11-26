#!/usr/bin/env bash
# Run a reviewed data fix (scripts/data-fixes/README.md). A dry run unless --apply is given;
# --apply takes a backup first.
#   sudo bash deploy/data-fix.sh scripts/data-fixes/<file>.ts [--apply --approved-by "Name"]
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DEPLOY_DIR/.."
git pull --ff-only
if [[ " $* " == *" --apply "* ]]; then
  echo "▶ Backing up first"
  bash "$DEPLOY_DIR/backup.sh"
fi
cd "$DEPLOY_DIR"
docker compose build data-fix >/dev/null
docker compose run --rm data-fix "$@"
