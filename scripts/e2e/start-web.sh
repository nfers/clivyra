#!/usr/bin/env bash
# Start Next.js web for Playwright with API URL pointing at the e2e API.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -f .env.e2e ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.e2e
  set +a
fi

export NODE_ENV="${NODE_ENV:-development}"
export PORT="${WEB_PORT:-3000}"
export API_BASE_URL="${API_BASE_URL:-http://127.0.0.1:3001}"
export NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-http://127.0.0.1:3001}"
export AUTH_COOKIE_DOMAIN=""
export AUTH_COOKIE_SECURE="${AUTH_COOKIE_SECURE:-false}"

echo "[e2e] ensuring @clivyra/types is built..."
npm run build --workspace @clivyra/types

echo "[e2e] waiting for API ${API_BASE_URL}/health ..."
for _ in $(seq 1 90); do
  if curl -fsS "${API_BASE_URL}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "${API_BASE_URL}/health" >/dev/null

echo "[e2e] starting web on :${PORT}..."
exec npm run dev --workspace @clivyra/web -- --port "${PORT}" --hostname 127.0.0.1
