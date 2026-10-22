#!/bin/bash
# Start 体彩预测网站 in background on port ${PORT:-8088}
# Prefer: systemctl restart jingcai  (loads EnvironmentFile=.env)
cd "$(dirname "$0")"
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
pkill -f "node server.js" 2>/dev/null
PORT=${PORT:-8088} setsid nohup node server.js > server.log 2>&1 &
sleep 1; tail -1 server.log
