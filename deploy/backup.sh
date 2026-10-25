#!/usr/bin/env bash
# Propfolio — back up the database and uploaded documents to /var/backups/propfolio.
# Keeps 14 days. Runs daily from cron (set up by setup.sh); also safe to run by hand.
# For safety against losing the whole server, also turn on your cloud provider's backups.
set -euo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST=/var/backups/propfolio
STAMP=$(date -u +%Y%m%d-%H%M)
mkdir -p "$DEST" && chmod 700 "$DEST"
cd "$DEPLOY_DIR"
docker compose exec -T postgres pg_dump -U propfolio -Fc propfolio > "$DEST/db-$STAMP.dump"
docker run --rm -v propfolio_documents:/documents:ro -v "$DEST":/backup alpine:3.22 \
  tar czf "/backup/documents-$STAMP.tar.gz" -C /documents .
chmod 600 "$DEST"/*
find "$DEST" -type f -mtime +14 -delete
echo "$(date -u +%FT%TZ) backup ok: db-$STAMP.dump, documents-$STAMP.tar.gz"
