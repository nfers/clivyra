#!/usr/bin/env bash
# Deploy remoto via SSH. Pensado para GitHub Actions, mas roda localmente também.
set -euo pipefail

ENV_NAME="${1:?usage: deploy-remote.sh <dev|prod>}"
case "$ENV_NAME" in
  dev|prod) ;;
  *)
    echo "ENV must be dev or prod" >&2
    exit 1
    ;;
esac

: "${OCI_SSH_PRIVATE_KEY:?OCI_SSH_PRIVATE_KEY is required}"
: "${OCI_SSH_USER:?OCI_SSH_USER is required}"

if [[ "$ENV_NAME" == "dev" ]]; then
  : "${OCI_DEV_HOST:?OCI_DEV_HOST is required}"
  HOST="$OCI_DEV_HOST"
  REMOTE_PATH="${OCI_DEV_PATH:-/opt/clivyra}"
  : "${DEV_ENV_FILE:?DEV_ENV_FILE is required}"
  ENV_FILE_CONTENT="$DEV_ENV_FILE"
else
  : "${OCI_PROD_HOST:?OCI_PROD_HOST is required}"
  HOST="$OCI_PROD_HOST"
  REMOTE_PATH="${OCI_PROD_PATH:-/opt/clivyra}"
  : "${PROD_ENV_FILE:?PROD_ENV_FILE is required}"
  ENV_FILE_CONTENT="$PROD_ENV_FILE"
fi

# infra/oci/scripts -> repo root
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f package.json ]]; then
  echo "package.json missing — merge Sprint 0 monorepo bootstrap before deploying." >&2
  exit 1
fi

if [[ ! -f infra/Dockerfile ]]; then
  echo "infra/Dockerfile missing — production image build is required." >&2
  exit 1
fi

if [[ ! -f infra/oci/compose.yml ]]; then
  echo "infra/oci/compose.yml missing." >&2
  exit 1
fi

KEY_FILE="$(mktemp)"
ENV_TMP="$(mktemp)"
cleanup() {
  rm -f "$KEY_FILE" "$ENV_TMP"
}
trap cleanup EXIT

umask 077
printf '%s\n' "$OCI_SSH_PRIVATE_KEY" >"$KEY_FILE"
printf '%s\n' "$ENV_FILE_CONTENT" >"$ENV_TMP"
chmod 600 "$KEY_FILE" "$ENV_TMP"

SSH_OPTS=(
  -i "$KEY_FILE"
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=accept-new
  -o ServerAliveInterval=30
)

echo "==> Ensuring remote directory $REMOTE_PATH on $HOST"
ssh "${SSH_OPTS[@]}" "${OCI_SSH_USER}@${HOST}" "mkdir -p '$REMOTE_PATH'"

echo "==> Syncing repository to ${OCI_SSH_USER}@${HOST}:${REMOTE_PATH}"
rsync -az --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '**/node_modules/' \
  --exclude '.next/' \
  --exclude '**/dist/' \
  --exclude '**/coverage/' \
  --exclude 'test-results/' \
  --exclude 'playwright-report/' \
  --exclude '.env' \
  --exclude '.env.*' \
  -e "ssh ${SSH_OPTS[*]}" \
  ./ "${OCI_SSH_USER}@${HOST}:${REMOTE_PATH}/"

echo "==> Writing remote .env"
scp "${SSH_OPTS[@]}" "$ENV_TMP" "${OCI_SSH_USER}@${HOST}:${REMOTE_PATH}/.env"

echo "==> Building and starting stack ($ENV_NAME)"
ssh "${SSH_OPTS[@]}" "${OCI_SSH_USER}@${HOST}" bash -s <<EOF
set -euo pipefail
cd '$REMOTE_PATH'
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not installed on remote host" >&2
  exit 1
fi
docker compose --env-file .env -f infra/oci/compose.yml pull || true
docker compose --env-file .env -f infra/oci/compose.yml up -d --build --remove-orphans
docker compose --env-file .env -f infra/oci/compose.yml ps
EOF

echo "==> Deploy $ENV_NAME finished"
