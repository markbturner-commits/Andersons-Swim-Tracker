#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

if [ -n "${VERCEL_TOKEN:-}" ] && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export VERCEL_TOKEN=\"$VERCEL_TOKEN\"" >> "$CLAUDE_ENV_FILE"
fi

if [ -n "${VERCEL_ORG_ID:-}" ] && [ -n "${VERCEL_PROJECT_ID:-}" ]; then
  mkdir -p .vercel
  cat > .vercel/project.json <<JSON
{"orgId":"$VERCEL_ORG_ID","projectId":"$VERCEL_PROJECT_ID"}
JSON
fi

LOG_DIR="$CLAUDE_PROJECT_DIR/.claude/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/session-start.log"

nohup bash -c '
  set -e
  cd "'"$CLAUDE_PROJECT_DIR"'"
  echo "[session-start] async load started at $(date -Is)"
  if [ -f "bun.lockb" ] || [ -f "bun.lock" ]; then
    bun install
  elif [ -f "pnpm-lock.yaml" ]; then
    pnpm install --frozen-lockfile
  elif [ -f "yarn.lock" ]; then
    yarn install --frozen-lockfile
  elif [ -f "package-lock.json" ]; then
    npm ci
  else
    npm install
  fi
  if ! command -v vercel >/dev/null 2>&1; then
    npm install -g vercel
  fi
  echo "[session-start] async load finished at $(date -Is)"
' > "$LOG_FILE" 2>&1 < /dev/null &
disown
