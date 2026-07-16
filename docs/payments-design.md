# Pay-per-analysis via x402 (USDC on Base) — design

Status: draft, 2026-07-16. Owner decision: x402, $5/analysis, free tier stays
(anon 3/day, wallet 10/day) — payment only unlocks analyses above the limit.

## Goals

- Charge $5 USDC (Base mainnet) per analysis once the free daily limit is hit.
- No subscriptions, no fiat, no new custom contracts — x402 handles transport,
  USDC `transferWithAuthorization` (EIP-3009) handles value.
- Failed runs must not eat money: a FAILED analysis grants a retry credit.

## Flow

```
POST /api/v1/analysis          (existing, free path)
  └─ rate limit exceeded → 429 RATE_LIMITED + { paidOption: { price: "5 USDC", endpoint } }

POST /api/v1/analysis/paid     (new, x402-protected)
  ├─ x402 layer: 402 challenge → client signs USDC authorization → facilitator settles
  ├─ handler: payment verified → create Payment row (SETTLED, txHash/facilitator ref)
  ├─ create AnalysisRequest (bypasses daily limit, requires wallet auth)
  └─ enqueue pipeline as usual
```

UI: on 429 in HomeForm show "Continue for $5 USDC" (wallet already connected —
paid analyses require wallet login). Client pays via x402 fetch wrapper.

## Data

```prisma
model Payment {
  id                 String   @id @default(uuid())
  payer              String   // wallet address
  amountMicroUsdc    BigInt   // 5_000_000 = $5
  chainId            Int
  txHash             String?  // settlement tx (from facilitator response)
  facilitatorRef     String?  // payment id / receipt from x402 facilitator
  status             PaymentStatus // SETTLED | CONSUMED | RETRY_CREDIT | REFUNDED
  analysisId         String?  @unique
  requesterUserId    String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@index([payer, createdAt])
  @@map("payments")
}
```

Lifecycle: SETTLED → CONSUMED (analysis completed/partial) or RETRY_CREDIT
(analysis FAILED → next paid attempt by same wallet consumes the credit before
asking for new payment).

## Config

```
PAYMENTS_ENABLED=true
PAYMENT_PRICE_USDC=5
PAYMENT_RECEIVER_ADDRESS=   # owner wallet receiving USDC
X402_FACILITATOR_URL=       # per research: CDP mainnet facilitator or alternative
CDP_API_KEY_ID= / CDP_API_KEY_SECRET=   # if CDP facilitator requires them
```

Staging: Base Sepolia + x402.org facilitator, price $0.01 for e2e tests.

## Open questions (pending x402 research)

1. Exact server package/API for Next.js 15 App Router (x402-next middleware vs
   route-level verification) and current versions.
2. Mainnet facilitator requirements (CDP account? fees? limits?).
3. What settlement artifact we get back (txHash vs payment id) for Payment row.
4. Client API for an already-connected viem WalletClient.

## Non-goals (v1)

- No bulk packages / subscriptions (later: B2B quota API keys).
- No fiat on-ramp.
- No refunds beyond retry credits.
