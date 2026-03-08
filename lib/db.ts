import { PrismaClient } from "@prisma/client";

import { config } from "@/lib/config";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

function withDefaultSearchParam(url: URL, key: string, value: string): void {
  if (!url.searchParams.get(key)) {
    url.searchParams.set(key, value);
  }
}

function normalizeDatabaseUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const isNeonPooler = url.hostname.includes("neon.tech") && url.hostname.includes("-pooler.");

    if (!isNeonPooler) {
      return rawUrl;
    }

    withDefaultSearchParam(url, "pgbouncer", "true");
    withDefaultSearchParam(url, "connect_timeout", "15");
    withDefaultSearchParam(url, "pool_timeout", "20");
    return url.toString();
  } catch {
    return rawUrl;
  }
}

const databaseUrl = normalizeDatabaseUrl(config.DATABASE_URL);

export const prisma =
  global.__prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    },
    log: ["error", "warn"]
  });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}
