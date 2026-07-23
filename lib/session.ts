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

/**
 * Read-only session lookup: never mints a session and never sets a cookie.
 *
 * Why this exists: on a first visit the home page fires several session reads
 * in parallel. If each cookieless read minted its own session (as
 * getSessionContext does), they would race to Set-Cookie different ids — the
 * last response to land wins the jar, and anything created under an earlier id
 * (e.g. a fast analysis submission) becomes invisible to its creator. Reads go
 * through here; a session is only created by state-changing routes, so exactly
 * one id is ever issued per browser.
 */
export async function getOptionalSessionContext(): Promise<SessionContext | null> {
  const cookieStore = await cookies();
  const currentCookie = cookieStore.get(config.SESSION_COOKIE_NAME)?.value;
  if (!currentCookie) {
    return null;
  }

  const expiresAt = new Date(Date.now() + config.SESSION_DAYS * 24 * 60 * 60 * 1000);
  // The id is fixed by the cookie, so concurrent refreshes converge on one row.
  await prisma.session.upsert({
    where: { sessionId: currentCookie },
    update: { expiresAt },
    create: { sessionId: currentCookie, expiresAt }
  });

  const session = await prisma.session.findUnique({
    where: { sessionId: currentCookie },
    include: { user: true }
  });

  return {
    sessionId: currentCookie,
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
