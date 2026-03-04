import { z } from "zod";

import { fail, ok, handleRouteError } from "@/lib/api";
import { buildSignMessage, generateNonce, isValidWallet, normalizeWallet } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { walletSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = walletSchema.parse(await request.json());

    if (!isValidWallet(payload.wallet)) {
      return fail(400, "INVALID_WALLET", "Invalid wallet address");
    }

    const wallet = normalizeWallet(payload.wallet);
    const nonce = generateNonce();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await prisma.authNonce.create({
      data: {
        wallet,
        nonce,
        expiresAt
      }
    });

    return ok({
      wallet,
      nonce,
      message: buildSignMessage(nonce),
      expiresAt
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(400, "INVALID_PAYLOAD", error.issues.map((issue) => issue.message).join("; "));
    }

    return handleRouteError(error, { route: "POST /api/v1/auth/nonce" });
  }
}
