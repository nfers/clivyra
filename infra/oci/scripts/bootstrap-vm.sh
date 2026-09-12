#!/usr/bin/env bash
# Bootstrap mínimo de uma VM OCI (Oracle Linux / Ubuntu).
# Rode uma vez como usuário com sudo.
set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | $SUDO sh
fi

$SUDO systemctl enable --now docker

if [[ -n "${SUDO_USER:-}" ]]; then
  $SUDO usermod -aG docker "$SUDO_USER"
elif [[ "${EUID}" -ne 0 ]]; then
  $SUDO usermod -aG docker "$USER"
fi

DEPLOY_PATH="${DEPLOY_PATH:-/opt/clivyra}"
echo "==> Preparing $DEPLOY_PATH"
$SUDO mkdir -p "$DEPLOY_PATH"
if [[ -n "${SUDO_USER:-}" ]]; then
  $SUDO chown -R "$SUDO_USER:$SUDO_USER" "$DEPLOY_PATH"
elif [[ "${EUID}" -ne 0 ]]; then
  $SUDO chown -R "$USER:$USER" "$DEPLOY_PATH"
fi

echo "==> Versions"
docker --version
docker compose version

echo "Done. Log out/in if your user was just added to the docker group."
