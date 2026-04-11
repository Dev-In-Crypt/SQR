import { z } from "zod";

import { fail, ok, handleRouteError, parseJsonBody } from "@/lib/api";
import {
  isValidWallet,
  normalizeWallet,
  verifyWalletSignature
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSessionContext } from "@/lib/session";
import { verifyWalletSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = verifyWalletSchema.parse(await parseJsonBody(request));

    if (!isValidWallet(payload.wallet)) {
      return fail(400, "INVALID_WALLET", "Invalid wallet address");
    }

    const wallet = normalizeWallet(payload.wallet);
    const nonceRecord = await prisma.authNonce.findFirst({
      where: {
        wallet,
        nonce: payload.nonce,
        usedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    if (!nonceRecord) {
      return fail(401, "INVALID_NONCE", "Nonce is invalid or expired");
    }

    const validSignature = await verifyWalletSignature({
      wallet,
      nonce: payload.nonce,
      signature: payload.signature
    });

    if (!validSignature) {
      return fail(401, "INVALID_SIGNATURE", "Wallet signature verification failed");
    }

    const session = await getSessionContext();

    const user = await prisma.user.upsert({
      where: {
        walletAddress: wallet
      },
      create: {
        walletAddress: wallet
      },
      update: {}
    });

    await prisma.$transaction([
      prisma.authNonce.update({
        where: {
          id: nonceRecord.id
        },
        data: {
          usedAt: new Date()
        }
      }),
      prisma.session.update({
        where: {
          sessionId: session.sessionId
        },
        data: {
          userId: user.id
        }
      })
    ]);

    return ok({
      ok: true,
      wallet,
      userId: user.id
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(400, "INVALID_PAYLOAD", error.issues.map((issue) => issue.message).join("; "));
    }

    return handleRouteError(error, { route: "POST /api/v1/auth/verify" });
  }
}
