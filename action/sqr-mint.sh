#!/usr/bin/env bash
# Anchor a report hash onchain by minting a ReceiptRegistry receipt directly
# against the contract (mintWithSig), non-interactively, with an owner signing key.
#
# The app is bypassed entirely — this signs the same EIP-712 MintAuthorization the
# app would and submits it, so /verify (which reads the chain) shows it anchored.
# Depends on Foundry `cast`. Prints a JSON result to stdout; the private key is
# never printed and `set -x` is never enabled here.
set -euo pipefail

RPC="${SQR_RPC_URL:?SQR_RPC_URL required to mint}"
REGISTRY="${SQR_REGISTRY:?SQR_REGISTRY required to mint}"
KEY="${SQR_MINT_KEY:?SQR_MINT_KEY required to mint}"
REPORT_HASH="${MINT_REPORT_HASH:?report hash required}"
CONTRACT_ADDRESS="${MINT_CONTRACT_ADDRESS:-0x0000000000000000000000000000000000000000}"
ANALYZER_VERSION="${MINT_ANALYZER_VERSION:-0.1.0}"

command -v cast >/dev/null 2>&1 || { echo "cast (Foundry) not found on PATH" >&2; exit 3; }

OWNER="$(cast wallet address --private-key "$KEY")"
# analyzerVersionHash = keccak256(canonicalJson({analyzerVersion})) — must match the app.
AVH="$(cast keccak "$(node -e 'process.stdout.write(JSON.stringify({analyzerVersion: process.argv[1]}))' "$ANALYZER_VERSION")")"

# Already anchored? getByHash reverts RECEIPT_NOT_FOUND when absent.
if EXISTING="$(cast call "$REGISTRY" "getByHash(bytes32)(uint256,address,address,bytes32,uint256)" "$REPORT_HASH" --rpc-url "$RPC" 2>/dev/null)"; then
  RID="$(printf '%s' "$EXISTING" | head -n1 | awk '{print $1}')"
  printf '{"anchored":true,"alreadyAnchored":true,"receiptId":"%s","txHash":null,"owner":"%s"}\n' "$RID" "$OWNER"
  exit 0
fi

CHAIN="$(cast chain-id --rpc-url "$RPC")"
NONCE="$(cast call "$REGISTRY" "nonces(address)(uint256)" "$OWNER" --rpc-url "$RPC")"; NONCE="${NONCE%% *}"
DEADLINE="$(( $(date +%s) + 3600 ))"

TD="$(mktemp)"; trap 'rm -f "$TD"' EXIT
cat > "$TD" <<JSON
{"types":{"EIP712Domain":[{"name":"name","type":"string"},{"name":"version","type":"string"},{"name":"chainId","type":"uint256"},{"name":"verifyingContract","type":"address"}],"MintAuthorization":[{"name":"reportHash","type":"bytes32"},{"name":"contractAddress","type":"address"},{"name":"analyzerVersionHash","type":"bytes32"},{"name":"owner","type":"address"},{"name":"nonce","type":"uint256"},{"name":"deadline","type":"uint256"}]},"primaryType":"MintAuthorization","domain":{"name":"ReceiptRegistry","version":"0.2.0","chainId":${CHAIN},"verifyingContract":"${REGISTRY}"},"message":{"reportHash":"${REPORT_HASH}","contractAddress":"${CONTRACT_ADDRESS}","analyzerVersionHash":"${AVH}","owner":"${OWNER}","nonce":${NONCE},"deadline":${DEADLINE}}}
JSON

SIG="$(cast wallet sign --private-key "$KEY" --data --from-file "$TD")"

RESULT="$(cast send "$REGISTRY" \
  "mintWithSig(bytes32,address,bytes32,address,uint256,uint256,bytes)" \
  "$REPORT_HASH" "$CONTRACT_ADDRESS" "$AVH" "$OWNER" "$NONCE" "$DEADLINE" "$SIG" \
  --private-key "$KEY" --rpc-url "$RPC" --json)"

TX="$(printf '%s' "$RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>process.stdout.write(JSON.parse(d).transactionHash||''))")"
RID="$(cast call "$REGISTRY" "getByHash(bytes32)(uint256,address,address,bytes32,uint256)" "$REPORT_HASH" --rpc-url "$RPC" 2>/dev/null | head -n1 | awk '{print $1}')"

printf '{"anchored":true,"alreadyAnchored":false,"receiptId":"%s","txHash":"%s","owner":"%s"}\n' "$RID" "$TX" "$OWNER"
