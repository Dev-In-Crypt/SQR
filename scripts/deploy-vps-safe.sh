#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

ENV_FILE="${SQR_ENV_FILE:-/etc/sqr/sqr.env}"
LOCAL_HEALTH_URL="${SQR_LOCAL_HEALTH_URL:-http://127.0.0.1:3000/api/v1/health}"
PUBLIC_APP_URL="${SQR_PUBLIC_APP_URL:-}"
PUBLIC_HEALTH_URL="${SQR_PUBLIC_HEALTH_URL:-}"

BACKUP_ROOT="${APP_DIR}/.deploy/backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
NEXT_DIR="${APP_DIR}/.next"
BACKUP_DIR="${BACKUP_ROOT}/.next.${TIMESTAMP}"

DEPLOY_SUCCESS=0
BACKUP_READY=0

log() {
  printf '[deploy:vps] %s\n' "$*"
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    log "Missing required command: ${command_name}"
    exit 1
  fi
}

read_env_value() {
  local key="$1"
  local file_path="$2"
  if [[ -r "$file_path" ]]; then
    grep -E "^${key}=" "$file_path" | head -n 1 | cut -d'=' -f2- || true
    return
  fi

  if sudo -n test -r "$file_path" >/dev/null 2>&1; then
    sudo -n grep -E "^${key}=" "$file_path" | head -n 1 | cut -d'=' -f2- || true
  fi
}

wait_for_http_200() {
  local url="$1"
  local attempts="${2:-20}"
  local sleep_seconds="${3:-2}"
  local attempt=""
  local status_code=""

  for attempt in $(seq 1 "$attempts"); do
    status_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "$url" || true)"
    if [[ "$status_code" == "200" ]]; then
      return 0
    fi

    log "Health check ${attempt}/${attempts} failed for ${url} (status=${status_code:-none})"
    sleep "$sleep_seconds"
  done

  return 1
}

prune_old_backups() {
  local keep_count="${1:-5}"
  local backups

  if [[ ! -d "$BACKUP_ROOT" ]]; then
    return
  fi

  mapfile -t backups < <(ls -1dt "${BACKUP_ROOT}"/.next.* 2>/dev/null || true)
  if (( ${#backups[@]} <= keep_count )); then
    return
  fi

  for backup in "${backups[@]:keep_count}"; do
    rm -rf "$backup"
    log "Pruned old backup: ${backup}"
  done
}

rollback() {
  if (( DEPLOY_SUCCESS == 1 )); then
    return
  fi

  if (( BACKUP_READY != 1 )); then
    log "Rollback skipped: no backup directory available"
    return
  fi

  log "Starting rollback using ${BACKUP_DIR}"
  rm -rf "$NEXT_DIR"
  cp -a "$BACKUP_DIR" "$NEXT_DIR"

  sudo -n systemctl reset-failed sqr-web || true
  sudo -n systemctl restart sqr-web || true

  if wait_for_http_200 "$LOCAL_HEALTH_URL" 20 2; then
    log "Rollback local health check passed"
  else
    log "Rollback local health check failed"
  fi

  if [[ -n "$PUBLIC_HEALTH_URL" ]]; then
    if wait_for_http_200 "$PUBLIC_HEALTH_URL" 20 2; then
      log "Rollback public health check passed"
    else
      log "Rollback public health check failed"
    fi
  fi
}

on_error() {
  local line_number="$1"
  log "Deployment failed at line ${line_number}"
  rollback
  exit 1
}

trap 'on_error $LINENO' ERR

main() {
  require_command npm
  require_command curl
  require_command sudo
  require_command systemctl

  if [[ -z "$PUBLIC_APP_URL" && -f "$ENV_FILE" ]]; then
    PUBLIC_APP_URL="$(read_env_value NEXT_PUBLIC_APP_URL "$ENV_FILE")"
  fi

  if [[ -z "$PUBLIC_HEALTH_URL" && -n "$PUBLIC_APP_URL" ]]; then
    PUBLIC_HEALTH_URL="${PUBLIC_APP_URL%/}/api/v1/health"
  fi

  log "Running preflight checks"
  sudo -n true

  if [[ ! -f "$ENV_FILE" ]]; then
    log "Environment file not found: ${ENV_FILE}"
    exit 1
  fi

  if ! sudo -n systemctl is-enabled sqr-web >/dev/null 2>&1; then
    log "sqr-web service is not enabled or not found"
    exit 1
  fi

  if ! sudo -n systemctl is-active nginx >/dev/null 2>&1; then
    log "nginx service is not active"
    exit 1
  fi

  mkdir -p "$BACKUP_ROOT"

  if [[ -d "$NEXT_DIR" ]]; then
    cp -a "$NEXT_DIR" "$BACKUP_DIR"
    BACKUP_READY=1
    log "Created build backup: ${BACKUP_DIR}"
  else
    log "No existing .next directory found; rollback backup is unavailable"
  fi

  log "Building Next.js production bundle"
  (
    cd "$APP_DIR"
    npm run build
  )

  log "Restarting sqr-web service"
  sudo -n systemctl reset-failed sqr-web
  sudo -n systemctl restart sqr-web

  log "Waiting for local health endpoint"
  wait_for_http_200 "$LOCAL_HEALTH_URL" 30 2

  if [[ -n "$PUBLIC_HEALTH_URL" ]]; then
    log "Waiting for public health endpoint: ${PUBLIC_HEALTH_URL}"
    wait_for_http_200 "$PUBLIC_HEALTH_URL" 30 2
  else
    log "Public health URL was not configured; skipping external check"
  fi

  DEPLOY_SUCCESS=1
  prune_old_backups 5
  log "Deployment completed successfully"
}

main "$@"
