#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK_SOURCE="$ROOT_DIR/.githooks/pre-commit"
HOOK_TARGET="$ROOT_DIR/.git/hooks/pre-commit"

if [[ ! -d "$ROOT_DIR/.git" ]]; then
  echo "Not a git repository: $ROOT_DIR"
  exit 1
fi

if [[ ! -f "$HOOK_SOURCE" ]]; then
  echo "Missing hook source file: $HOOK_SOURCE"
  exit 1
fi

cp "$HOOK_SOURCE" "$HOOK_TARGET"
chmod +x "$HOOK_TARGET"

echo "Installed pre-commit hook at $HOOK_TARGET"
