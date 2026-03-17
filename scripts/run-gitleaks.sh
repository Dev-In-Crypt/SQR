#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CONFIG_FILE=".gitleaks.toml"
GITLEAKS_VERSION="8.24.2"
MODE="${1:-git}"

if [[ "$MODE" != "git" && "$MODE" != "staged" ]]; then
  echo "Usage: bash scripts/run-gitleaks.sh [git|staged]"
  exit 1
fi

args=(git . --config "$CONFIG_FILE" --redact --no-banner)
if [[ "$MODE" == "staged" ]]; then
  args=(git . --staged --config "$CONFIG_FILE" --redact --no-banner)
fi

download_gitleaks() {
  local os arch archive_name url tmp_dir
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "$arch" in
    x86_64) arch="x64" ;;
    aarch64|arm64) arch="arm64" ;;
    *)
      echo "Unsupported architecture for auto-install: $arch"
      return 1
      ;;
  esac

  archive_name="gitleaks_${GITLEAKS_VERSION}_${os}_${arch}.tar.gz"
  url="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/${archive_name}"
  tmp_dir="$(mktemp -d)"

  echo "Installing gitleaks v${GITLEAKS_VERSION} locally (tools/gitleaks)..."
  curl -fsSL "$url" -o "$tmp_dir/$archive_name"
  tar -xzf "$tmp_dir/$archive_name" -C "$tmp_dir"

  mkdir -p "$ROOT_DIR/tools"
  mv "$tmp_dir/gitleaks" "$ROOT_DIR/tools/gitleaks"
  chmod +x "$ROOT_DIR/tools/gitleaks"

  rm -rf "$tmp_dir"
}

run_local() {
  gitleaks "${args[@]}"
}

run_docker() {
  docker run --rm \
    -v "$ROOT_DIR:/repo" \
    -w /repo \
    ghcr.io/gitleaks/gitleaks:latest \
    "${args[@]}"
}

if command -v gitleaks >/dev/null 2>&1; then
  run_local
  exit 0
fi

if command -v docker >/dev/null 2>&1; then
  echo "gitleaks is not installed locally; using Docker image ghcr.io/gitleaks/gitleaks:latest"
  run_docker
  exit 0
fi

if [[ -x "$ROOT_DIR/tools/gitleaks" ]]; then
  "$ROOT_DIR/tools/gitleaks" "${args[@]}"
  exit 0
fi

download_gitleaks
"$ROOT_DIR/tools/gitleaks" "${args[@]}"
