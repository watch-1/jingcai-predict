#!/usr/bin/env bash
# Push repo tree to production without touching .env, data/, backups/, or extra prod-only assets.
# Usage: ./tools/sync-prod.sh [user@host:/opt/jingcai/]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-root@120.77.152.74:/opt/jingcai/}"
case "$DEST" in *:*) ;; *) echo "DEST must be user@host:path (got: $DEST)" >&2; exit 1;; esac
rsync -avz --delete \
  --filter 'P .env' \
  --filter 'P data/' \
  --filter 'P backups/' \
  --filter 'P public/assets/players/***' \
  --filter 'P public/assets/crests/***' \
  --filter 'P public/*.apk' \
  --exclude '.env' \
  --exclude 'data/' \
  --exclude 'backups/' \
  --exclude 'node_modules/' \
  --exclude '.git/' \
  --exclude 'android/build/' \
  --exclude 'dist/' \
  "$ROOT/" "$DEST"
echo "Synced to $DEST ( .env, data/, backups/, prod-only player/crest PNGs and public/*.apk protected from --delete ). Run npm install + systemctl restart jingcai on the host."
