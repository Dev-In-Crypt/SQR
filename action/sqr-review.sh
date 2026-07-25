#!/usr/bin/env bash
# SQR Solidity Review — GitHub Action entrypoint.
#
# Submits a deployed verified Base contract (by address) or a single self-contained
# Solidity file to the SQR quick-scan API, waits for the static review, and emits a
# provenance-anchored summary: findings + the deterministic report hash + a public
# /verify link anyone can check onchain, with no report content exposed.
#
# Depends only on tools preinstalled on GitHub-hosted runners: bash, curl, jq, gh.
set -euo pipefail

API="${SQR_API_URL:-https://solidity-scan.com}"
API="${API%/}"
CHAIN_ID="${SQR_CHAIN_ID:-8453}"
FAIL_ON="$(printf '%s' "${SQR_FAIL_ON:-none}" | tr '[:upper:]' '[:lower:]')"
DO_COMMENT="${SQR_COMMENT:-true}"
ADDRESS="${SQR_CONTRACT_ADDRESS:-}"
FILE="${SQR_FILE:-}"
MARKER="<!-- sqr-review-action -->"
COOKIES="$(mktemp)"
trap 'rm -f "$COOKIES" payload.json 2>/dev/null || true' EXIT

err() { printf '::error::%s\n' "$*" >&2; }
note() { printf '%s\n' "$*"; }

severity_rank() {
  case "$(printf '%s' "${1:-}" | tr '[:lower:]' '[:upper:]')" in
    CRITICAL) echo 4 ;;
    HIGH) echo 3 ;;
    MEDIUM) echo 2 ;;
    LOW) echo 1 ;;
    *) echo 0 ;;
  esac
}

# --- validate inputs -------------------------------------------------------
if [[ -n "$ADDRESS" && -n "$FILE" ]]; then
  err "Provide either 'contract-address' or 'file', not both."; exit 2
fi
if [[ -z "$ADDRESS" && -z "$FILE" ]]; then
  err "One of 'contract-address' or 'file' is required."; exit 2
fi

# --- build request payload -------------------------------------------------
if [[ -n "$ADDRESS" ]]; then
  MODE="address"
  jq -n --arg a "$ADDRESS" --argjson c "$CHAIN_ID" \
    '{inputType:"BASE_ADDRESS", address:$a, chainId:$c}' > payload.json
  note "Reviewing deployed contract $ADDRESS on chain $CHAIN_ID"
else
  MODE="file"
  [[ -f "$FILE" ]] || { err "File not found: $FILE"; exit 2; }
  jq -n --rawfile code "$FILE" --argjson c "$CHAIN_ID" \
    '{inputType:"PASTE_CODE", code:$code, chainId:$c}' > payload.json
  note "Reviewing file $FILE (chain $CHAIN_ID)"
fi

# --- submit ----------------------------------------------------------------
SUBMIT="$(curl -sS -c "$COOKIES" -X POST "$API/api/v1/analysis/quick" \
  -H 'content-type: application/json' --data @payload.json)" || { err "Submit request failed"; exit 1; }

ANALYSIS_ID="$(printf '%s' "$SUBMIT" | jq -r '.analysisId // empty')"
if [[ -z "$ANALYSIS_ID" ]]; then
  CODE="$(printf '%s' "$SUBMIT" | jq -r '.error.code // "UNKNOWN"')"
  MSG="$(printf '%s' "$SUBMIT" | jq -r '.error.message // "no analysisId returned"')"
  err "Submission rejected ($CODE): $MSG"; exit 1
fi
note "Analysis $ANALYSIS_ID submitted; waiting for the review to finish…"

# --- poll for a terminal status -------------------------------------------
STATUS=""; REPORT_ID=""; TOKEN=""; ERROR_CODE=""; ERROR_DETAIL=""
for _ in $(seq 1 60); do
  POLL="$(curl -sS -b "$COOKIES" "$API/api/v1/analysis/$ANALYSIS_ID")" || true
  STATUS="$(printf '%s' "$POLL" | jq -r '.status // empty')"
  case "$STATUS" in
    COMPLETED|DONE_WITH_WARNINGS|PARTIAL)
      REPORT_ID="$(printf '%s' "$POLL" | jq -r '.reportId // empty')"
      TOKEN="$(printf '%s' "$POLL" | jq -r '.privateToken // empty')"
      break ;;
    FAILED)
      ERROR_CODE="$(printf '%s' "$POLL" | jq -r '.errorCode // "UNKNOWN"')"
      ERROR_DETAIL="$(printf '%s' "$POLL" | jq -r '.errorDetail // empty')"
      break ;;
  esac
  sleep 3
done

# --- render + publish ------------------------------------------------------
publish() {
  local body="$1"
  printf '%s\n' "$body" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
  if [[ "$DO_COMMENT" == "true" && "${GITHUB_EVENT_NAME:-}" == "pull_request" ]]; then
    local pr repo
    pr="$(jq -r '.pull_request.number // empty' "${GITHUB_EVENT_PATH:-/dev/null}" 2>/dev/null || true)"
    repo="${GITHUB_REPOSITORY:-}"
    if [[ -n "$pr" && -n "$repo" && -n "${GH_TOKEN:-}" ]]; then
      local existing
      existing="$(gh api "repos/$repo/issues/$pr/comments" --paginate \
        --jq "[.[] | select(.body | contains(\"$MARKER\")) | .id][0]" 2>/dev/null || true)"
      if [[ -n "$existing" && "$existing" != "null" ]]; then
        gh api -X PATCH "repos/$repo/issues/comments/$existing" -f body="$body" >/dev/null \
          && note "Updated PR comment #$existing" || err "Failed to update PR comment"
      else
        gh api -X POST "repos/$repo/issues/$pr/comments" -f body="$body" >/dev/null \
          && note "Posted PR comment on #$pr" || err "Failed to post PR comment"
      fi
    fi
  fi
}

set_out() { echo "$1=$2" >> "${GITHUB_OUTPUT:-/dev/null}"; }

if [[ "$STATUS" == "FAILED" ]]; then
  BODY="$MARKER
## 🛡️ SQR Solidity Review — could not complete

The analysis stopped before a report was produced.

- **Reason:** \`${ERROR_CODE}\`${ERROR_DETAIL:+ — $ERROR_DETAIL}
- **Mode:** ${MODE}${ADDRESS:+ (\`$ADDRESS\`)}

_This is a pipeline error, not a security verdict._"
  publish "$BODY"
  set_out status "FAILED"
  set_out error-code "$ERROR_CODE"
  err "Analysis failed: $ERROR_CODE"
  exit 1
fi

if [[ -z "$REPORT_ID" ]]; then
  err "Timed out waiting for the review to finish (status: ${STATUS:-unknown})."
  exit 1
fi

REPORT="$(curl -sS -b "$COOKIES" "$API/api/v1/report/$REPORT_ID?token=$TOKEN")" || { err "Failed to fetch report"; exit 1; }

REPORT_HASH="$(printf '%s' "$REPORT" | jq -r '.reportHash // empty')"
TOP_SEVERITY="$(printf '%s' "$REPORT" | jq -r '.topSeverity // "INFO"')"
ANALYZER_VERSION="$(printf '%s' "$REPORT" | jq -r '.report.metadata.analyzerVersion // "unknown"')"
REPORT_CONTRACT="$(printf '%s' "$REPORT" | jq -r '.report.metadata.contractAddress // "0x0000000000000000000000000000000000000000"')"
VERIFY_URL="$API/verify?hash=$REPORT_HASH"

# --- optional onchain anchor (mint a Base receipt from CI) ------------------
ANCHOR_LINE=""
if [[ -n "${SQR_MINT_KEY:-}" ]]; then
  if [[ -z "${SQR_RPC_URL:-}" ]]; then
    err "mint-key was provided but rpc-url is empty — cannot anchor onchain."
  else
    note "Anchoring report hash onchain…"
    if MINT_JSON="$(SQR_REGISTRY="${SQR_REGISTRY:-0x15e2D6a335aBBa7374ebeBa5EBD994346E2de35B}" \
        MINT_REPORT_HASH="$REPORT_HASH" MINT_CONTRACT_ADDRESS="$REPORT_CONTRACT" \
        MINT_ANALYZER_VERSION="$ANALYZER_VERSION" \
        bash "$(dirname "$0")/sqr-mint.sh")"; then
      RECEIPT_ID="$(printf '%s' "$MINT_JSON" | jq -r '.receiptId // empty')"
      RECEIPT_TX="$(printf '%s' "$MINT_JSON" | jq -r '.txHash // empty')"
      ALREADY="$(printf '%s' "$MINT_JSON" | jq -r '.alreadyAnchored // false')"
      MINT_CHAIN="$(cast chain-id --rpc-url "$SQR_RPC_URL" 2>/dev/null || echo "$CHAIN_ID")"
      case "$MINT_CHAIN" in
        84532) EXPLORER="https://sepolia.basescan.org/tx/" ;;
        *) EXPLORER="https://basescan.org/tx/" ;;
      esac
      if [[ "$ALREADY" == "true" ]]; then
        ANCHOR_LINE="- **Receipt on Base:** already anchored (receipt #$RECEIPT_ID) ✓"
      else
        ANCHOR_LINE="- **Receipt on Base:** anchored (receipt #$RECEIPT_ID) — [tx]($EXPLORER$RECEIPT_TX) ✓"
      fi
      set_out receipt-id "$RECEIPT_ID"
      set_out receipt-tx "$RECEIPT_TX"
      set_out anchored "true"
      note "Anchored onchain: receipt #$RECEIPT_ID"
    else
      err "Onchain anchoring failed; continuing with the deterministic hash only."
      set_out anchored "false"
    fi
  fi
fi

# Severity counts + a compact findings table.
COUNTS="$(printf '%s' "$REPORT" | jq -r '
  (.findings // []) | group_by(.severity) | map({sev: .[0].severity, n: length})
  | map("\(.n) \(.sev)") | join(" · ") | if . == "" then "no static findings" else . end')"
TABLE="$(printf '%s' "$REPORT" | jq -r '
  (.findings // []) as $f
  | if ($f | length) == 0 then "_No static findings in scope. Independent review may still add validation._"
    else "| Severity | Finding | Confidence |\n|---|---|---|\n" +
      ([ $f[] | "| \(.severity) | \(.title) | \(.confidence)% |" ] | join("\n"))
    end')"

BODY="$MARKER
## 🛡️ SQR Solidity Review — \`$TOP_SEVERITY\`

**$COUNTS**  ·  static analysis (Slither) via [Solidity Quick Review]($API)

$TABLE

<details><summary>Provenance</summary>

- **Report hash:** \`$REPORT_HASH\`
- **Analyzer version:** \`$ANALYZER_VERSION\`
${ANCHOR_LINE:+$ANCHOR_LINE
}- **Verify onchain (no report content revealed):** [$VERIFY_URL]($VERIFY_URL)

The report hash is a deterministic keccak256 over the static findings and input
identity — anyone can reproduce it and check the receipt on Base independently.
</details>

_Static screening, not a full audit._"

publish "$BODY"

set_out status "$STATUS"
set_out report-id "$REPORT_ID"
set_out report-hash "$REPORT_HASH"
set_out top-severity "$TOP_SEVERITY"
set_out verify-url "$VERIFY_URL"

note "Review complete: $TOP_SEVERITY · $COUNTS"
note "Report hash: $REPORT_HASH"

# --- optional severity gate ------------------------------------------------
if [[ "$FAIL_ON" != "none" ]]; then
  THRESH="$(severity_rank "$FAIL_ON")"
  TOP="$(severity_rank "$TOP_SEVERITY")"
  if (( TOP >= THRESH && THRESH > 0 )); then
    err "Top severity $TOP_SEVERITY is at or above the fail-on threshold ($FAIL_ON)."
    exit 1
  fi
fi
