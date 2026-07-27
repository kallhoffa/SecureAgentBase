#!/usr/bin/env bash
# Install git hooks after npm install
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
HOOKS_DIR="$REPO_ROOT/.git/hooks"

if [ -d "$HOOKS_DIR" ]; then
  ln -sf "$SCRIPT_DIR/pre-push.sh" "$HOOKS_DIR/pre-push" 2>/dev/null || true
  chmod +x "$SCRIPT_DIR/pre-push.sh" 2>/dev/null || true
fi
