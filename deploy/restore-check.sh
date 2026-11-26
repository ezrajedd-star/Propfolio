#!/usr/bin/env bash
# Propfolio monthly backup-restore check — 1st of each month from cron (set up by setup.sh).
#
# Restores the newest database backup into a THROW-AWAY database in its own container (never
# the live one), counts the rows in every table, deletes the copy and reports the result to
# System health. Platform Owners get the report by email. Only counts leave this script.
#   sudo bash deploy/restore-check.sh
set -uo pipefail
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-ops.sh
source "$DEPLOY_DIR/lib-ops.sh"
BACKUPS=/var/backups/propfolio
NAME=propfolio-restore-check
START=$(date +%s)
problem=""
counts="{}"

latest=$(ls -1t "$BACKUPS"/db-*.dump 2>/dev/null | head -1)
if [[ -z "$latest" ]]; then
  problem="No backup file found in $BACKUPS."
else
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  pw=$(openssl rand -hex 16)
  docker run -d --name "$NAME" --network none -e POSTGRES_USER=propfolio -e POSTGRES_PASSWORD="$pw" \
    -e POSTGRES_DB=propfolio postgres:16.10-alpine >/dev/null
  for _ in $(seq 1 30); do docker exec "$NAME" pg_isready -U propfolio -d propfolio >/dev/null 2>&1 && break; sleep 2; done
  # The app's restricted role must exist for the saved permissions to restore.
  docker exec "$NAME" psql -q -U propfolio -d propfolio -c "CREATE ROLE propfolio_tenant NOLOGIN" >/dev/null 2>&1
  if ! docker exec -i "$NAME" pg_restore -U propfolio -d propfolio --no-owner --exit-on-error < "$latest" 2> "$STATE_DIR/restore-check.err"; then
    problem="pg_restore failed: $(tail -c 200 "$STATE_DIR/restore-check.err" | tr -d '\n')"
  else
    counts=$(docker exec "$NAME" psql -tA -U propfolio -d propfolio -c "
      SELECT coalesce(json_object_agg(table_name, n), '{}') FROM (
        SELECT table_name, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', table_name), false, true, '')))[1]::text::bigint AS n
        FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') t")
  fi
  docker rm -f "$NAME" >/dev/null 2>&1
  rm -f "$STATE_DIR/restore-check.err"
fi

file=$(basename "${latest:-none}")
stamp=$(printf '%s' "$file" | sed -n 's/^db-\([0-9]\{8\}\)-\([0-9]\{2\}\)\([0-9]\{2\}\)\.dump$/\1T\2:\3:00Z/p')
taken=null
[[ -n "$stamp" ]] && taken="\"${stamp:0:4}-${stamp:4:2}-${stamp:6:2}T${stamp:9:5}:00.000Z\""
secs=$(( $(date +%s) - START ))
prob_json=null
[[ -n "$problem" ]] && prob_json="\"$(json_escape "$problem")\""
ops_post restore-check "{\"backupFile\":\"$file\",\"backupTakenAt\":$taken,\"tableCounts\":$counts,\"durationSeconds\":$secs,\"problem\":$prob_json}"
if [[ -n "$problem" ]]; then echo "$(date -u +%FT%TZ) restore check FAILED: $problem"; exit 1; fi
echo "$(date -u +%FT%TZ) restore check ok: $file restored in ${secs}s"
