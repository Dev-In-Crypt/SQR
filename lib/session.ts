import { cookies, headers } from "next/headers";

import { resolveClientIp } from "@/lib/client-ip";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";

export interface SessionContext {
  sessionId: string;
  userId: string | null;
  walletAddress: string | null;
}

export async function getSessionContext(): Promise<SessionContext> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const currentCookie = cookieStore.get(config.SESSION_COOKIE_NAME)?.value;
  const sessionId = currentCookie ?? crypto.randomUUID();
  const expiresAt = new Date(Date.now() + config.SESSION_DAYS * 24 * 60 * 60 * 1000);
  const host = headerStore.get("host") || "";
  const isLocalHttpHost = host.startsWith("localhost:") || host.startsWith("127.0.0.1:");

  if (!currentCookie) {
    cookieStore.set(config.SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.NODE_ENV === "production" && !isLocalHttpHost,
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
  return resolveClientIp({
    getHeader: (name) => headerStore.get(name),
    trustedHeaders: config.trustedIpHeaders,
    trustedProxyHops: config.TRUST_PROXY_HOPS,
    fallbackIp: "0.0.0.0"
  });
}
