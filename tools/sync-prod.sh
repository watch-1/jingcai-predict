#!/usr/bin/env bash
# Push repo tree to production without touching .env or data/.
# Usage: ./tools/sync-prod.sh [user@host:/opt/jingcai/]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:-root@120.77.152.74:/opt/jingcai/}"
case "$DEST" in *:*) ;; *) echo "DEST must be user@host:path (got: $DEST)" >&2; exit 1;; esac
rsync -avz --delete \
  --exclude '.env' \
  --exclude 'data/' \
  --exclude 'node_modules/' \
  --exclude '.git/' \
  --exclude 'android/build/' \
  --exclude 'dist/' \
  "$ROOT/" "$DEST"
echo "Synced to $DEST ( .env and data/ untouched on server ). Run npm install + systemctl restart jingcai on the host."
