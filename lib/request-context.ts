import { headers } from "next/headers";

import { getRedis } from "@/lib/redis";

const memoryCache = new Map<string, { token: string; expiresAt: number }>();

export async function cachePrivateToken(
  analysisId: string,
  token: string,
  ttlSeconds = 86_400
): Promise<void> {
  const redis = getRedis();
  const key = `analysis:private-token:${analysisId}`;

  if (redis) {
    await redis.connect().catch(() => undefined);
    await redis.set(key, token, "EX", ttlSeconds);
    return;
  }

  memoryCache.set(key, { token, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function peekPrivateToken(analysisId: string): Promise<string | null> {
  const redis = getRedis();
  const key = `analysis:private-token:${analysisId}`;

  if (redis) {
    await redis.connect().catch(() => undefined);
    const token = await redis.get(key);
    return token ?? null;
  }

  const item = memoryCache.get(key);
  if (!item || item.expiresAt < Date.now()) {
    memoryCache.delete(key);
    return null;
  }

  return item.token;
}

export async function consumePrivateToken(analysisId: string): Promise<string | null> {
  const redis = getRedis();
  const key = `analysis:private-token:${analysisId}`;

  if (redis) {
    await redis.connect().catch(() => undefined);
    const token = await redis.get(key);
    if (!token) {
      return null;
    }
    await redis.del(key);
    return token;
  }

  const token = await peekPrivateToken(analysisId);
  if (!token) {
    return null;
  }

  memoryCache.delete(key);
  return token;
}

export async function getRequestId(): Promise<string | undefined> {
  const headerStore = await headers();
  return headerStore.get("x-request-id") ?? undefined;
}
