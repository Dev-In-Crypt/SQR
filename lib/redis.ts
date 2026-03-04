import Redis from "ioredis";

import { config } from "@/lib/config";
import { logError } from "@/lib/logger";

let redisClient: Redis | null = null;

if (config.REDIS_URL) {
  redisClient = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true
  });

  redisClient.on("error", (error) => {
    logError("Redis connection error", { message: error.message });
  });
}

export function getRedis(): Redis | null {
  return redisClient;
}
