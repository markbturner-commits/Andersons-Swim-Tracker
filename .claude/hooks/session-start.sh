#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

npm install

if ! command -v vercel >/dev/null 2>&1; then
  npm install -g vercel
fi

if [ -n "${VERCEL_TOKEN:-}" ]; then
  echo "export VERCEL_TOKEN=\"$VERCEL_TOKEN\"" >> "$CLAUDE_ENV_FILE"
fi

if [ -n "${VERCEL_ORG_ID:-}" ] && [ -n "${VERCEL_PROJECT_ID:-}" ]; then
  mkdir -p .vercel
  cat > .vercel/project.json <<JSON
{"orgId":"$VERCEL_ORG_ID","projectId":"$VERCEL_PROJECT_ID"}
JSON
fi
