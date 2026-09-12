#!/usr/bin/env bash
# Prepare DB + seed E2E fixtures, then start the API for Playwright.
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
export API_PORT="${API_PORT:-3001}"
export WEB_ORIGIN="${WEB_ORIGIN:-http://127.0.0.1:3000}"
export DATABASE_URL="${DATABASE_URL:-postgresql://clivyra:clivyra@127.0.0.1:5432/clivyra?schema=public}"
export AUTH_ACCESS_TOKEN_SECRET="${AUTH_ACCESS_TOKEN_SECRET:-local-development-access-token-secret-change-me}"
export AUTH_PASSWORD_PEPPER="${AUTH_PASSWORD_PEPPER:-local-development-password-pepper-change-me}"
export AUTH_COOKIE_SECURE="${AUTH_COOKIE_SECURE:-false}"
# Force host-only cookies (Domain=localhost breaks 127.0.0.1 Playwright baseURL).
export AUTH_COOKIE_DOMAIN=""
export AUTH_SELF_SIGNUP_ENABLED="${AUTH_SELF_SIGNUP_ENABLED:-false}"
export AUTH_EXPOSE_RESET_TOKEN="${AUTH_EXPOSE_RESET_TOKEN:-false}"
export AUDIT_IP_HASH_SALT="${AUDIT_IP_HASH_SALT:-local-dev-audit-ip-hash-salt}"
export MAILER_DRIVER="${MAILER_DRIVER:-noop}"
export FILE_STORAGE_DRIVER="${FILE_STORAGE_DRIVER:-local}"
export FILE_STORAGE_LOCAL_DIR="${FILE_STORAGE_LOCAL_DIR:-.local-storage}"
export FILE_STORAGE_SIGNING_SECRET="${FILE_STORAGE_SIGNING_SECRET:-local-development-file-storage-signing-secret}"
export API_PUBLIC_BASE_URL="${API_PUBLIC_BASE_URL:-http://127.0.0.1:3001}"

echo "[e2e] waiting for Postgres..."
for _ in $(seq 1 60); do
  if PGPASSWORD="${PGPASSWORD:-clivyra}" pg_isready -h 127.0.0.1 -p 5432 -U clivyra -d clivyra >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
PGPASSWORD="${PGPASSWORD:-clivyra}" pg_isready -h 127.0.0.1 -p 5432 -U clivyra -d clivyra

echo "[e2e] prisma generate + migrate deploy..."
npm run prisma:generate --workspace @clivyra/api
npm run prisma:migrate:deploy --workspace @clivyra/api

echo "[e2e] seeding fixtures..."
npx ts-node --transpile-only -P apps/api/tsconfig.json scripts/e2e/seed.ts

echo "[e2e] building @clivyra/types + API..."
npm run build --workspace @clivyra/types
npm run build --workspace @clivyra/api

echo "[e2e] starting API on :${API_PORT}..."
exec npm run start --workspace @clivyra/api
