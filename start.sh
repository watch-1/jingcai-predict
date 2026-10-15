#!/bin/bash
# Start 体彩预测网站 in background on port ${PORT:-8088}
cd "$(dirname "$0")"
pkill -f "node server.js" 2>/dev/null
PORT=${PORT:-8088} setsid nohup node server.js > server.log 2>&1 &
sleep 1; tail -1 server.log
