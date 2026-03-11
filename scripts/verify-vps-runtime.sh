#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${SQR_ENV_FILE:-/etc/sqr/sqr.env}"
LOCAL_HEALTH_URL="${SQR_LOCAL_HEALTH_URL:-http://127.0.0.1:3000/api/v1/health}"
PUBLIC_APP_URL="${SQR_PUBLIC_APP_URL:-}"
PUBLIC_HEALTH_URL="${SQR_PUBLIC_HEALTH_URL:-}"

FAILURES=0

log() {
  printf '[verify:vps] %s\n' "$*"
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

extract_domain() {
  local url="$1"
  printf '%s' "$url" | sed -E 's~^https?://~~; s~/.*$~~'
}

check_service_active() {
  local service_name="$1"
  if systemctl is-active --quiet "$service_name"; then
    log "Service OK: ${service_name}"
  else
    log "Service FAIL: ${service_name}"
    systemctl status "$service_name" --no-pager || true
    FAILURES=$((FAILURES + 1))
  fi
}

check_http_200() {
  local label="$1"
  local url="$2"
  local status_code

  status_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 "$url" || true)"
  if [[ "$status_code" == "200" ]]; then
    log "HTTP OK (${label}): ${url}"
  else
    log "HTTP FAIL (${label}): ${url} (status=${status_code:-none})"
    FAILURES=$((FAILURES + 1))
  fi
}

check_local_health_payload() {
  local payload
  payload="$(curl -sS --max-time 12 "$LOCAL_HEALTH_URL" || true)"
  if [[ "$payload" == *'"ok":true'* ]]; then
    log "Local health payload OK"
  else
    log "Local health payload FAIL: ${payload:-empty}"
    FAILURES=$((FAILURES + 1))
  fi
}

check_dns_hints() {
  local domain="$1"
  local cname=""
  local vercel_txt=""

  if ! command -v dig >/dev/null 2>&1; then
    log "dig not installed; skipping DNS hint checks"
    return
  fi

  cname="$(dig +short CNAME "$domain" | tr -d '\r')"
  vercel_txt="$(dig +short TXT "_vercel.${domain}" | tr -d '\r')"

  if [[ "$cname" == *"vercel"* ]] || [[ -n "$vercel_txt" ]]; then
    log "DNS hint: potential Vercel linkage detected (CNAME=${cname:-none}, _vercel TXT=${vercel_txt:-none})"
  else
    log "DNS hint: no Vercel linkage detected for ${domain}"
  fi
}

main() {
  if [[ -z "$PUBLIC_APP_URL" && -f "$ENV_FILE" ]]; then
    PUBLIC_APP_URL="$(read_env_value NEXT_PUBLIC_APP_URL "$ENV_FILE")"
  fi

  if [[ -z "$PUBLIC_HEALTH_URL" && -n "$PUBLIC_APP_URL" ]]; then
    PUBLIC_HEALTH_URL="${PUBLIC_APP_URL%/}/api/v1/health"
  fi

  log "Checking service status"
  check_service_active nginx
  check_service_active sqr-web
  check_service_active sqr-worker

  log "Checking health endpoints"
  check_http_200 "local" "$LOCAL_HEALTH_URL"
  check_local_health_payload

  if [[ -n "$PUBLIC_HEALTH_URL" ]]; then
    check_http_200 "public" "$PUBLIC_HEALTH_URL"
  else
    log "Public health URL not configured; skipping external health check"
  fi

  if [[ -n "$PUBLIC_APP_URL" ]]; then
    check_dns_hints "$(extract_domain "$PUBLIC_APP_URL")"
  fi

  if (( FAILURES > 0 )); then
    log "Runtime verification finished with ${FAILURES} failure(s)"
    exit 1
  fi

  log "Runtime verification passed"
}

main "$@"
