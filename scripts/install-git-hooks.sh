#!/usr/bin/env sh
set -e
HOOKS_DIR=".githooks"
if [ ! -d "$HOOKS_DIR" ]; then
  mkdir -p "$HOOKS_DIR"
fi
if [ -f "$HOOKS_DIR/commit-msg" ]; then
  chmod +x "$HOOKS_DIR/commit-msg"
fi
git config core.hooksPath "$HOOKS_DIR"
echo "Configured git hooks path to $HOOKS_DIR"
echo "If you cloned the repo, run:"
echo "  sh scripts/install-git-hooks.sh"
