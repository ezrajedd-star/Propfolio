#!/usr/bin/env bash
# Propfolio releases, run by the GitHub release pipeline (through release-ssh.sh) or by hand:
#
#   sudo bash deploy/release.sh deploy <commit>   back up, switch to that version, rebuild, check
#   sudo bash deploy/release.sh rollback          go back to the version before the current one
#   sudo bash deploy/release.sh rollback <commit> go back to a particular earlier version
#   sudo bash deploy/release.sh status            the current version and the last 10 releases
#
# If the new version doesn't pass its health check within 3 minutes, it rolls back by itself.
# Rolling back changes the code only: database changes are written so the previous version
# keeps working with them (docs/decisions.md §47).
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-ops.sh
source "$DEPLOY_DIR/lib-ops.sh"
REPO="$DEPLOY_DIR/.."
HISTORY="$STATE_DIR/releases"
LOCK="$STATE_DIR/release.lock"
touch "$HISTORY"

exec 9>"$LOCK"
flock -n 9 || { echo "Another release is running. Try again in a few minutes."; exit 1; }

current() { git -C "$REPO" rev-parse HEAD; }

healthy() {
  for _ in $(seq 1 18); do
    local_curl "https://$APP_HOST/api/health?deep=1" >/dev/null 2>&1 && return 0
    sleep 10
  done
  return 1
}

switch_to() {  # switch_to <commit> <what>
  local sha="$1" what="$2"
  git -C "$REPO" fetch --quiet origin
  git -C "$REPO" cat-file -e "$sha^{commit}" 2>/dev/null || { echo "Unknown version $sha"; exit 1; }
  git -C "$REPO" checkout --quiet --detach "$sha"
  cd "$DEPLOY_DIR"
  docker compose build --quiet
  docker compose up -d
  docker image prune -f >/dev/null
  echo "$(date -u +%FT%TZ) $what $(git -C "$REPO" rev-parse --short HEAD)" >> "$HISTORY"
}

case "${1:-}" in
  deploy)
    sha="${2:?Usage: release.sh deploy <commit>}"
    [[ "$sha" =~ ^[0-9a-f]{7,40}$ ]] || { echo "A commit id, please."; exit 1; }
    before=$(current)
    echo "▶ Backing up first"
    bash "$DEPLOY_DIR/backup.sh"
    echo "▶ Switching to $sha"
    switch_to "$sha" deploy
    echo "▶ Checking it works"
    if healthy; then
      echo "✔ Released $(git -C "$REPO" log -1 --format='%h %s')"
    else
      echo "✘ The new version failed its health check. Rolling back to ${before:0:7}."
      switch_to "$before" auto-rollback
      healthy && echo "✔ Back on ${before:0:7}." || echo "✘ Still not healthy after rolling back: follow docs/runbooks/outage.md."
      exit 1
    fi
    ;;
  rollback)
    target="${2:-}"
    if [[ -z "$target" ]]; then
      now=$(git -C "$REPO" rev-parse --short HEAD)
      # The release deployed just before the current version was last deployed.
      target=$(awk -v now="$now" '$2=="deploy"{ if ($3==now) { t=prev } else { prev=$3 } } END{print t}' "$HISTORY")
      [[ -n "$target" ]] || { echo "No earlier release recorded on this server."; exit 1; }
    fi
    [[ "$target" =~ ^[0-9a-f]{7,40}$ ]] || { echo "A commit id, please."; exit 1; }
    echo "▶ Rolling back to $target"
    switch_to "$target" rollback
    healthy && echo "✔ Rolled back to $target." || { echo "✘ Not healthy after rolling back: follow docs/runbooks/outage.md."; exit 1; }
    ;;
  status)
    echo "Now on: $(git -C "$REPO" log -1 --format='%h %s (%cd)' --date=short)"
    echo "Last releases:"; tail -10 "$HISTORY"
    ;;
  *)
    sed -n '2,12p' "$0"; exit 1 ;;
esac
