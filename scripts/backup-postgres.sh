#!/usr/bin/env bash
#
# Nightly database backup, with retention and a verification step.
#
#   ./scripts/backup-postgres.sh              # take a backup
#   ./scripts/backup-postgres.sh --verify-only <file>
#
# Add to cron as the deploy user:
#   15 2 * * * cd /srv/dhakalive && ./scripts/backup-postgres.sh >> /var/log/dhakalive-backup.log 2>&1
#
# Self-hosted Postgres has no automated backups. This is that.
#
# One warning worth stating plainly: a backup on the same droplet as the
# database protects against a bad migration or a dropped table, and against
# nothing else. If the droplet dies, both are gone. Ship these off the box —
# see docs/deployment.md.

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker/docker-compose.postgres.yml}"
BACKUP_DIR="${BACKUP_DIR:-docker/postgres/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
DB_USER="${POSTGRES_USER:-dhakalive}"
DB_NAME="${POSTGRES_DB:-dhakalive}"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1"; }

# `pg_restore --list` reads the archive's table of contents. If that parses, the
# dump is structurally intact — far better than trusting a non-zero file size.
verify() {
  local file="$1"
  if docker compose -f "$COMPOSE_FILE" exec -T postgres \
      pg_restore --list "/backups/$(basename "$file")" >/dev/null 2>&1; then
    log "verified: $(basename "$file") is a readable archive"
    return 0
  fi
  log "FAILED verification: $(basename "$file") is not a readable archive"
  return 1
}

if [ "${1:-}" = "--verify-only" ]; then
  verify "${2:?usage: $0 --verify-only <file>}"
  exit $?
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
NAME="dhakalive-${STAMP}.dump"

log "starting backup -> ${NAME}"

# Custom format (-Fc): compressed, and restorable selectively with pg_restore.
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc -f "/backups/${NAME}"

SIZE="$(du -h "${BACKUP_DIR}/${NAME}" | cut -f1)"
log "written: ${NAME} (${SIZE})"

verify "${BACKUP_DIR}/${NAME}"

# Prune only after the new backup has been verified, so a failing backup never
# takes the last good one with it.
DELETED="$(find "$BACKUP_DIR" -name 'dhakalive-*.dump' -mtime "+${RETAIN_DAYS}" -print -delete | wc -l | tr -d ' ')"
log "retention: removed ${DELETED} backup(s) older than ${RETAIN_DAYS} days"

REMAINING="$(find "$BACKUP_DIR" -name 'dhakalive-*.dump' | wc -l | tr -d ' ')"
log "done: ${REMAINING} backup(s) retained"
