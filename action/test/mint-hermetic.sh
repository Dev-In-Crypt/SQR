#!/usr/bin/env bash
# Hermetic test for action/sqr-mint.sh: deploy ReceiptRegistry to a local anvil,
# mint a receipt with the public anvil key, and assert the onchain record. No
# secrets, no real funds, no app stack. Requires Foundry (anvil/forge/cast) + node.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
PORT="${ANVIL_PORT:-8555}"
RPC="http://127.0.0.1:$PORT"
KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" # anvil #0 (public)

for bin in anvil forge cast node jq; do
  command -v "$bin" >/dev/null 2>&1 || { echo "missing tool: $bin" >&2; exit 3; }
done

echo "→ forge build ReceiptRegistry"
forge build --contracts contracts/ReceiptRegistry.sol >/dev/null

echo "→ start anvil on $PORT"
anvil --port "$PORT" --chain-id 8453 --silent &
ANVIL_PID=$!
trap 'kill $ANVIL_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 20); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.5; done

BYTECODE="$(node -e "process.stdout.write(require('./contracts/out/ReceiptRegistry.sol/ReceiptRegistry.json').bytecode.object)")"
REG="$(cast send --private-key "$KEY" --rpc-url "$RPC" --create "$BYTECODE" --json \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(JSON.parse(d).contractAddress))")"
echo "→ registry deployed at $REG"

HASH="0x$(node -e 'process.stdout.write("ab".repeat(32))')"
EXPECTED_AVH="$(cast keccak "$(node -e 'process.stdout.write(JSON.stringify({analyzerVersion:"0.1.0"}))')")"

run_mint() {
  SQR_RPC_URL="$RPC" SQR_REGISTRY="$REG" SQR_MINT_KEY="$KEY" \
  MINT_REPORT_HASH="$HASH" MINT_CONTRACT_ADDRESS="0x0000000000000000000000000000000000000000" \
  MINT_ANALYZER_VERSION="0.1.0" bash "$ROOT/action/sqr-mint.sh"
}

echo "→ first mint"
OUT1="$(run_mint)"; echo "  $OUT1"
[[ "$(echo "$OUT1" | jq -r '.anchored')" == "true" ]] || { echo "FAIL: not anchored"; exit 1; }
[[ "$(echo "$OUT1" | jq -r '.alreadyAnchored')" == "false" ]] || { echo "FAIL: expected fresh mint"; exit 1; }
[[ -n "$(echo "$OUT1" | jq -r '.txHash')" ]] || { echo "FAIL: no txHash"; exit 1; }

echo "→ onchain getByHash assertions"
CHAIN_AVH="$(cast call "$REG" "getByHash(bytes32)(uint256,address,address,bytes32,uint256)" "$HASH" --rpc-url "$RPC" | sed -n '4p')"
[[ "$CHAIN_AVH" == "$EXPECTED_AVH" ]] || { echo "FAIL: analyzerVersionHash mismatch ($CHAIN_AVH != $EXPECTED_AVH)"; exit 1; }

echo "→ idempotency (second run must not re-mint)"
OUT2="$(run_mint)"; echo "  $OUT2"
[[ "$(echo "$OUT2" | jq -r '.alreadyAnchored')" == "true" ]] || { echo "FAIL: expected alreadyAnchored"; exit 1; }

echo "✓ mint-hermetic passed"
