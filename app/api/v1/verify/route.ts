import { ok, handleRouteError } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { enforcePublicLookupRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/session";
import { explorerTxUrl, readMintedReceiptByHash } from "@/lib/receipt";
import { requiredReceiptNetwork } from "@/lib/base-network";

export const runtime = "nodejs";

const REPORT_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawHash = (url.searchParams.get("hash") || "").trim();

    if (!REPORT_HASH_PATTERN.test(rawHash)) {
      throw new ApiError(
        400,
        "INVALID_HASH",
        "Provide a 32-byte report hash: 0x followed by 64 hex characters"
      );
    }

    await enforcePublicLookupRateLimit({ bucket: "verify-ip", ip: await getClientIp() });

    const hash = rawHash.toLowerCase();
    const network = requiredReceiptNetwork();
    const onchain = await readMintedReceiptByHash(hash);

    if (!onchain.exists) {
      return ok({
        hash,
        verified: false,
        network: { chainId: network.chainId, label: network.requiredNetworkLabel },
        onchain: { exists: false },
        record: null
      });
    }

    const record = await prisma.receipt.findFirst({
      where: { reportHash: hash },
      orderBy: { createdAt: "desc" },
      select: { txHash: true, chainId: true, mintedAt: true }
    });

    return ok({
      hash,
      verified: true,
      network: { chainId: network.chainId, label: network.requiredNetworkLabel },
      onchain: {
        exists: true,
        receiptId: onchain.receiptId,
        owner: onchain.owner,
        contractAddress: onchain.contractAddress,
        analyzerVersionHash: onchain.analyzerVersionHash,
        timestamp: onchain.timestamp.toISOString()
      },
      record: record
        ? {
            txHash: record.txHash,
            chainId: record.chainId,
            mintedAt: record.mintedAt.toISOString(),
            explorerTxUrl: explorerTxUrl(record.txHash, record.chainId)
          }
        : null
    });
  } catch (error) {
    return handleRouteError(error, { route: "GET /api/v1/verify" });
  }
}
