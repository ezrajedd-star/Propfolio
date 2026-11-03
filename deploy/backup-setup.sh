#!/usr/bin/env bash
# Propfolio — set up encrypted off-site backups (run once, as root, on the server):
#
#   sudo bash deploy/backup-setup.sh
#
# It makes a new backup key pair. The PRIVATE key is shown once, for you to keep in your
# password manager; it is not stored on this server, so nobody who gets into the server can
# open the backups. The public key and the storage details go into deploy/.env. Then it runs
# one backup to check everything works. Running it again replaces the storage details and,
# if you choose, the key (old backups still need the old private key).
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$DEPLOY_DIR/.env"
say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ask() { local q="$1" d="${2:-}" a; read -r -p "$q${d:+ [$d]}: " a; echo "${a:-$d}"; }

[[ $EUID -eq 0 ]] || { echo "Please run with sudo: sudo bash deploy/backup-setup.sh"; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Run deploy/setup.sh first."; exit 1; }
command -v age-keygen >/dev/null || apt-get install -y -qq age >/dev/null

current() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }

say "Where to keep the backups (S3-compatible storage at another provider)"
echo "For Backblaze B2: Buckets → Create a Bucket (Private), then App Keys → Add a New Application"
echo "Key for that bucket. The endpoint is shown on the bucket, like s3.us-west-004.backblazeb2.com."
ENDPOINT=$(ask "Endpoint (without https://)" "$(current BACKUP_S3_ENDPOINT)")
REGION=$(ask "Region (the part after 's3.', e.g. us-west-004)" "$(current BACKUP_S3_REGION)")
BUCKET=$(ask "Bucket name" "$(current BACKUP_S3_BUCKET)")
KEY_ID=$(ask "Key ID" "$(current BACKUP_S3_ACCESS_KEY_ID)")
read -r -s -p "Application key (hidden while you type/paste): " SECRET; echo
HEARTBEAT=$(ask "Heartbeat URL from Healthchecks.io (optional, Enter to skip)" "$(current BACKUP_HEARTBEAT_URL)")

RECIPIENT=$(current BACKUP_AGE_RECIPIENT)
if [[ -z "$RECIPIENT" || "$(ask "Make a new backup key? (yes/no)" "no")" == "yes" ]]; then
  KEYFILE=$(mktemp) && trap 'shred -u "$KEYFILE" 2>/dev/null || rm -f "$KEYFILE"' EXIT
  age-keygen -o "$KEYFILE" 2>/dev/null
  RECIPIENT=$(age-keygen -y "$KEYFILE")
  say "YOUR BACKUP PRIVATE KEY — copy it into your password manager NOW"
  echo "Without it, the backups can't be opened. It won't be shown again."
  echo
  grep '^AGE-SECRET-KEY-' "$KEYFILE"
  echo
  read -r -p "Type 'saved' when it's safely stored: " ok
  [[ "$ok" == "saved" ]] || { echo "Stopped. Nothing was changed."; exit 1; }
fi

umask 077
tmp=$(mktemp)
grep -vE '^BACKUP_' "$ENV_FILE" > "$tmp" || true
cat >> "$tmp" <<ENVEOF
BACKUP_AGE_RECIPIENT=$RECIPIENT
BACKUP_S3_ENDPOINT=$ENDPOINT
BACKUP_S3_REGION=$REGION
BACKUP_S3_BUCKET=$BUCKET
BACKUP_S3_ACCESS_KEY_ID=$KEY_ID
BACKUP_S3_SECRET_ACCESS_KEY=${SECRET:-$(current BACKUP_S3_SECRET_ACCESS_KEY)}
BACKUP_HEARTBEAT_URL=$HEARTBEAT
ENVEOF
mv "$tmp" "$ENV_FILE" && chmod 600 "$ENV_FILE"

say "Running one backup now to check"
bash "$DEPLOY_DIR/backup.sh"
say "Done. Backups run every night at 02:30 Manila time. To restore, see docs/restore.md."
