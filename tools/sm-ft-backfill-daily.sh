#!/usr/bin/env bash
# Daily (or manual) SportMonks backfill of official 体彩 finished matches
# in the last 10 days. Writes existing disk caches so client opens are
# cache-first. Safe to re-run; does not wipe unrelated caches.
set -euo pipefail

ROOT="${JINGCAI_ROOT:-/opt/jingcai}"
cd "$ROOT"

export DATA_DIR="${DATA_DIR:-$ROOT/data}"
mkdir -p "$DATA_DIR"

LOCK="$DATA_DIR/sm-ft-backfill.lock"
LOG="$DATA_DIR/sm-ft-backfill-daily.log"
OUT="$DATA_DIR/sm-ft-backfill-last.json"
NODE="${NODE_BIN:-/usr/local/bin/node}"
SLEEP_MS="${SLEEP_MS:-250}"
DAYS="${DAYS:-10}"

# Keep the log from growing without bound.
if [[ -f "$LOG" ]]; then
  size=$(wc -c < "$LOG" || echo 0)
  if [[ "${size:-0}" -gt 2097152 ]]; then
    tail -n 4000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
  fi
fi

exec 200>"$LOCK"
# Wait up to 30 minutes if a manual/one-shot backfill is already running.
if ! flock -w 1800 200; then
  echo "[sm-ft-backfill-daily] $(date '+%F %T %Z') skip: lock busy" >> "$LOG"
  exit 0
fi

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.env"
  set +a
fi
unset ALLOW_AF_HTTP
export DATA_DIR
export NODE_ENV="${NODE_ENV:-production}"

stamp=$(date '+%F %T %Z')
{
  echo "==== $stamp start days=$DAYS sleep-ms=$SLEEP_MS ===="
  set +e
  "$NODE" "$ROOT/tools/sm-ft-backfill.js" \
    --days "$DAYS" \
    --sleep-ms "$SLEEP_MS" \
    --out "$OUT"
  rc=$?
  set -e
  echo "==== $(date '+%F %T %Z') done exit=$rc ===="
  exit "$rc"
} >> "$LOG" 2>&1
