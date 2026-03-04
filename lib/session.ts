import { cookies, headers } from "next/headers";

import { config } from "@/lib/config";
import { prisma } from "@/lib/db";

export interface SessionContext {
  sessionId: string;
  userId: string | null;
  walletAddress: string | null;
}

export async function getSessionContext(): Promise<SessionContext> {
  const cookieStore = await cookies();
  const currentCookie = cookieStore.get(config.SESSION_COOKIE_NAME)?.value;
  const sessionId = currentCookie ?? crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.SESSION_DAYS * 24 * 60 * 60 * 1000);

  if (!currentCookie) {
    cookieStore.set(config.SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production",
      path: "/",
      expires: expiresAt
    });
  }

  await prisma.session.upsert({
    where: { sessionId },
    update: { expiresAt },
    create: {
      sessionId,
      expiresAt
    }
  });

  const session = await prisma.session.findUnique({
    where: { sessionId },
    include: { user: true }
  });

  return {
    sessionId,
    userId: session?.userId ?? null,
    walletAddress: session?.user?.walletAddress ?? null
  };
}

export async function getClientIp(): Promise<string> {
  const headerStore = await headers();
  const fwd = headerStore.get("x-forwarded-for");
  if (!fwd) {
    return "0.0.0.0";
  }

  return fwd.split(",")[0]?.trim() || "0.0.0.0";
}
