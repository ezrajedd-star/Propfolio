#!/usr/bin/env bash
# The only thing the GitHub release pipeline's SSH key can run on this server (a "forced
# command", set up by deploy/release-setup.sh). It allows exactly: deploy <commit>,
# rollback [<commit>] and status. Anything else is refused.
set -euo pipefail
read -r -a args <<< "${SSH_ORIGINAL_COMMAND:-}"
case "${args[0]:-}" in
  deploy) [[ ${#args[@]} -eq 2 && "${args[1]}" =~ ^[0-9a-f]{7,40}$ ]] || { echo "refused"; exit 1; } ;;
  rollback) [[ ${#args[@]} -le 2 && ( ${#args[@]} -eq 1 || "${args[1]}" =~ ^[0-9a-f]{7,40}$ ) ]] || { echo "refused"; exit 1; } ;;
  status) [[ ${#args[@]} -eq 1 ]] || { echo "refused"; exit 1; } ;;
  *) echo "refused"; exit 1 ;;
esac
exec sudo /opt/propfolio/deploy/release.sh "${args[@]}"
