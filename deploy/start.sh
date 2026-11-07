#!/bin/sh
# Starts the AI service in the background and the API in the foreground.
# Both share AI_SERVICE_TOKEN; if it isn't set, a random one is made for this run.
set -e

APP_DIR="${APP_DIR:-/app}"
VENV="${VENV:-/opt/venv}"

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set." >&2
  exit 1
fi
if [ -z "$JWT_SECRET" ]; then
  echo "JWT_SECRET is not set." >&2
  exit 1
fi

export AI_SERVICE_TOKEN="${AI_SERVICE_TOKEN:-$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')}"
export AI_SERVICE_URL="http://127.0.0.1:8001"

cd "$APP_DIR/ai"
"$VENV/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --log-level warning &

cd "$APP_DIR/api"
exec node_modules/.bin/tsx src/server.ts
