# Impact

Last updated (UTC): `2026-03-12`
Update cadence: weekly (manual)

## Metrics snapshot

| Metric | 7d | 30d | All-time |
| --- | ---: | ---: | ---: |
| Analyses run | 40 | 40 | 40 |
| Unique wallets | 4 | 4 | 5 |
| Receipts minted on Base | 0 | 0 | 0 |
| Verified Base contracts analyzed | 6 | 6 | 6 |

## Definitions

- Analyses run: count of `analysis_requests` by `createdAt`.
- Unique wallets: distinct wallet-linked users active in analyses (`requesterUserId`) for 7d/30d, and total `users` for all-time.
- Receipts minted on Base: count of `receipts` with `chainId = 8453` by `mintedAt`.
- Verified Base contracts analyzed: count of analyses with `inputType = BASE_ADDRESS`, `chainId = 8453`, and related `source_bundles.isVerifiedSource = true`.

## Manual weekly update

1. Run the metrics command from repo root.
2. Replace values in the table.
3. Update the `Last updated` date.

```bash
node -e "const {PrismaClient}=require('@prisma/client'); const prisma=new PrismaClient(); const now=Date.now(); const d=(n)=>new Date(now-n*24*60*60*1000); async function run(){ const periods=[['7d',d(7)],['30d',d(30)]]; const out={}; for(const [label,since] of periods){ const [analyses, wallets, receipts, verified]=await Promise.all([ prisma.analysisRequest.count({where:{createdAt:{gte:since}}}), prisma.analysisRequest.findMany({where:{createdAt:{gte:since}, requesterUserId:{not:null}}, distinct:['requesterUserId'], select:{requesterUserId:true}}).then(r=>r.length), prisma.receipt.count({where:{chainId:8453, mintedAt:{gte:since}}}), prisma.analysisRequest.count({where:{createdAt:{gte:since}, chainId:8453, inputType:'BASE_ADDRESS', sourceBundle:{is:{isVerifiedSource:true}}}}) ]); out[label]={analyses,uniqueWallets:wallets,receiptsMintedBase:receipts,verifiedBaseContractsAnalyzed:verified}; } const [a,w,r,v]=await Promise.all([prisma.analysisRequest.count(), prisma.user.count(), prisma.receipt.count({where:{chainId:8453}}), prisma.analysisRequest.count({where:{chainId:8453,inputType:'BASE_ADDRESS',sourceBundle:{is:{isVerifiedSource:true}}}})]); out.allTime={analyses:a,uniqueWallets:w,receiptsMintedBase:r,verifiedBaseContractsAnalyzed:v}; console.log(JSON.stringify(out,null,2)); } run().catch(e=>{console.error(e.message||e); process.exit(1)}).finally(()=>prisma.$disconnect());"
```
