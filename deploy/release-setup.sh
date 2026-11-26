#!/usr/bin/env bash
# Propfolio — let the GitHub release pipeline deploy to this server (run once, as root).
#   sudo bash deploy/release-setup.sh
# Creates a "release" user that can only run release-ssh.sh (deploy, rollback, status), makes a
# new SSH key for it and prints the PRIVATE key once, for the GitHub secret. Nothing else on the
# server is reachable with that key.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "Please run with sudo."; exit 1; }
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ "$DEPLOY_DIR" == /opt/propfolio/deploy ]] || { echo "Propfolio must be in /opt/propfolio."; exit 1; }
chmod +x "$DEPLOY_DIR"/release.sh "$DEPLOY_DIR"/release-ssh.sh
id release >/dev/null 2>&1 || useradd --create-home --shell /bin/bash release
echo "release ALL=(root) NOPASSWD: /opt/propfolio/deploy/release.sh" > /etc/sudoers.d/propfolio-release
chmod 440 /etc/sudoers.d/propfolio-release
WORK=$(mktemp -d) && trap 'rm -rf "$WORK"' EXIT
ssh-keygen -q -t ed25519 -N "" -C "github-release" -f "$WORK/key"
install -d -m 700 -o release -g release /home/release/.ssh
echo "command=\"/opt/propfolio/deploy/release-ssh.sh\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $(cat "$WORK/key.pub")" \
  > /home/release/.ssh/authorized_keys
chown release:release /home/release/.ssh/authorized_keys && chmod 600 /home/release/.ssh/authorized_keys
cat <<DONE

Done. In GitHub → your repository → Settings → Environments → (staging or production) →
Add environment secret:

  Name:  DEPLOY_SSH_KEY
  Value: everything between the lines below (including the BEGIN and END lines)
-----------------------------------------------------------------------------------
$(cat "$WORK/key")
-----------------------------------------------------------------------------------

Also add two environment VARIABLES (not secrets) in the same place:

  DEPLOY_HOST         $(curl -fsS -m 5 https://ifconfig.me 2>/dev/null || echo "<this server's IP>")
  DEPLOY_KNOWN_HOSTS  $(ssh-keyscan -t ed25519 localhost 2>/dev/null | sed "s/^localhost/$(curl -fsS -m 5 https://ifconfig.me 2>/dev/null || echo SERVER_IP)/")

Don't keep this key anywhere else. If it leaks, run this script again: the old key stops working.
DONE
