#!/usr/bin/env bash
# Propfolio — daily backup of the database and uploaded documents.
#
# 1. Always: a copy on this server in /var/backups/propfolio (kept 14 days), for quick restores.
# 2. When off-site backup is set up (deploy/backup-setup.sh): both files are encrypted with
#    `age` to the backup public key — only the private key, kept by the owner and never on this
#    server, can open them — and copied to S3-compatible storage at another provider (e.g.
#    Backblaze B2). Off-site copies are kept 30 days.
# 3. Optional: a "heartbeat" ping (BACKUP_HEARTBEAT_URL, e.g. Healthchecks.io) after success, so
#    a missed or failed backup sends an email.
#
# Runs daily from cron (set up by setup.sh); safe to run by hand: sudo bash deploy/backup.sh
# Restore steps: docs/restore.md
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST=/var/backups/propfolio
STAMP=$(date -u +%Y%m%d-%H%M)
LOCAL_DAYS=14
OFFSITE_DAYS=30

# Settings from deploy/.env (root-only). Only the BACKUP_* lines are read.
if [[ -f "$DEPLOY_DIR/.env" ]]; then
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^BACKUP_[A-Z0-9_]+$ ]] || continue
    value="${value%\"}"
    export "$key=${value#\"}"
  done < "$DEPLOY_DIR/.env"
fi

mkdir -p "$DEST" && chmod 700 "$DEST"
cd "$DEPLOY_DIR"
DB_FILE="$DEST/db-$STAMP.dump"
DOCS_FILE="$DEST/documents-$STAMP.tar.gz"
docker compose exec -T postgres pg_dump -U propfolio -Fc propfolio > "$DB_FILE"
docker run --rm -v propfolio_documents:/documents:ro -v "$DEST":/backup alpine:3.22 \
  tar czf "/backup/documents-$STAMP.tar.gz" -C /documents .
chmod 600 "$DEST"/*
# Refuse to call an empty dump a backup.
if [[ ! -s "$DB_FILE" ]]; then
  echo "$(date -u +%FT%TZ) backup FAILED: empty database dump" >&2
  exit 1
fi
find "$DEST" -type f -mtime +"$LOCAL_DAYS" -delete
echo "$(date -u +%FT%TZ) local backup ok: $(basename "$DB_FILE"), $(basename "$DOCS_FILE")"

if [[ -n "${BACKUP_AGE_RECIPIENT:-}" && -n "${BACKUP_S3_BUCKET:-}" ]]; then
  command -v age >/dev/null || apt-get install -y -qq age >/dev/null
  WORK=$(mktemp -d) && trap 'rm -rf "$WORK"' EXIT
  for f in "$DB_FILE" "$DOCS_FILE"; do
    age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$WORK/$(basename "$f").age" "$f"
  done
  # rclone in a container; the storage settings are passed as environment variables only.
  rclone() {
    docker run --rm -v "$WORK":/data:ro \
      -e RCLONE_CONFIG_OFFSITE_TYPE=s3 \
      -e RCLONE_CONFIG_OFFSITE_PROVIDER="${BACKUP_S3_PROVIDER:-Other}" \
      -e RCLONE_CONFIG_OFFSITE_ENDPOINT="${BACKUP_S3_ENDPOINT:-}" \
      -e RCLONE_CONFIG_OFFSITE_REGION="${BACKUP_S3_REGION:-}" \
      -e RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID:?}" \
      -e RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY:?}" \
      -e RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true \
      rclone/rclone:1.68.2 "$@"
  }
  rclone copy /data "offsite:$BACKUP_S3_BUCKET/propfolio/" --s3-no-check-bucket
  rclone delete "offsite:$BACKUP_S3_BUCKET/propfolio/" --min-age "${OFFSITE_DAYS}d"
  echo "$(date -u +%FT%TZ) off-site backup ok: encrypted copies in $BACKUP_S3_BUCKET (kept $OFFSITE_DAYS days)"
else
  echo "$(date -u +%FT%TZ) off-site backup NOT set up (run deploy/backup-setup.sh)"
fi

if [[ -n "${BACKUP_HEARTBEAT_URL:-}" ]]; then
  curl -fsS -m 10 --retry 3 "$BACKUP_HEARTBEAT_URL" >/dev/null || echo "heartbeat ping failed" >&2
fi
