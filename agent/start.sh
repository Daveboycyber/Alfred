#!/bin/bash
# Reliable starter for Alfred web UI
# Restarts the server if it dies

cd "$(dirname "$0")/.."

while true; do
  echo "[$(date)] Starting Alfred web..."
  npm run web
  echo "[$(date)] Process exited. Restarting in 3s..."
  sleep 3
done
