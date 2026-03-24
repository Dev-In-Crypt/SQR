#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-staged}"

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "gitleaks not installed; skipping scan"
  exit 0
fi

case "$MODE" in
  staged)
    gitleaks protect --staged --redact
    ;;
  *)
    echo "unsupported gitleaks mode: $MODE" >&2
    exit 1
    ;;
esac
