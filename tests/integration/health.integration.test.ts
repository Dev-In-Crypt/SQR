import { describe, expect, it } from "vitest";

import { createSession } from "./setup/helpers";

describe("API integration - health readiness", () => {
  it("reports queue readiness for current runtime mode", async () => {
    const session = createSession({ ip: "203.0.113.90" });

    const response = await session.getJson<{
      ok?: boolean;
      queue?: {
        enabled?: boolean;
        mode?: "inline" | "redis";
        ready?: boolean;
        workerCount?: number;
      };
    }>("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);

    if (process.env.SQR_TEST_WITH_REDIS === "1") {
      expect(response.body.queue?.mode).toBe("redis");
      expect(response.body.queue?.enabled).toBe(true);
      expect(response.body.queue?.ready).toBe(true);
      expect((response.body.queue?.workerCount || 0) > 0).toBe(true);
      return;
    }

    expect(response.body.queue?.mode).toBe("inline");
    expect(response.body.queue?.enabled).toBe(false);
    expect(response.body.queue?.ready).toBe(true);
  });
});

