import { ApiError } from "@/lib/errors";
import { getRedis } from "@/lib/redis";

const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

function secondsUntilUtcDayEnd(): number {
  const now = new Date();
  const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.max(1, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
}

function todayKeyPart(): string {
  return new Date().toISOString().slice(0, 10);
}

async function incrementKey(key: string): Promise<number> {
  const redis = getRedis();

  if (redis) {
    await redis.connect().catch(() => undefined);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, secondsUntilUtcDayEnd());
    }
    return count;
  }

  const existing = memoryCounters.get(key);
  if (!existing || existing.expiresAt <= Date.now()) {
    const expiresAt = Date.now() + secondsUntilUtcDayEnd() * 1000;
    memoryCounters.set(key, { count: 1, expiresAt });
    return 1;
  }

  existing.count += 1;
  return existing.count;
}

export async function enforceAnalysisCreateRateLimit(params: {
  ip: string;
  wallet: string | null;
}): Promise<void> {
  const { ip, wallet } = params;
  const day = todayKeyPart();

  if (!wallet) {
    const ipCount = await incrementKey(`rate:${day}:anon-ip:${ip}`);
    if (ipCount > 5) {
      throw new ApiError(429, "RATE_LIMITED", "Daily anonymous limit reached (5/day per IP)");
    }
    return;
  }

  const [walletCount, ipCount] = await Promise.all([
    incrementKey(`rate:${day}:wallet:${wallet}`),
    incrementKey(`rate:${day}:wallet-ip:${ip}`)
  ]);

  if (walletCount > 20) {
    throw new ApiError(429, "RATE_LIMITED", "Daily wallet limit reached (20/day)");
  }

  if (ipCount > 20) {
    throw new ApiError(429, "RATE_LIMITED", "Daily IP limit reached for authenticated requests");
  }
}
