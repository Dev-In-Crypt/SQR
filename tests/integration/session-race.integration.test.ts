import { describe, expect, it } from "vitest";

import { createSession } from "./setup/helpers";

// Regression for the anon-session race: cookieless parallel session reads used
// to each mint their own session and Set-Cookie, so the last response to land
// replaced the jar — an analysis submitted moments later could belong to a
// session the browser no longer holds, making its status endpoint 404 for the
// creator. Session reads are now read-only; only state-changing routes mint.

const COMPLETE_SNIPPET = [
  "// SPDX-License-Identifier: MIT",
  "pragma solidity ^0.8.20;",
  "",
  "contract SessionRaceProbe {",
  "    uint256 public value;",
  "",
  "    function bump(uint256 next) external {",
  "        value = next;",
  "    }",
  "}"
].join("\n");

function collectSetCookies(response: Response): string[] {
  const viaGetter =
    (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() || [];
  if (viaGetter.length > 0) {
    return viaGetter;
  }
  const fallback = response.headers.get("set-cookie");
  return fallback ? [fallback] : [];
}

describe("API integration - anon session race", () => {
  it("cookieless parallel session reads never mint sessions or set cookies", async () => {
    const baseUrl = process.env.SQR_TEST_BASE_URL as string;
    expect(baseUrl).toBeTruthy();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${baseUrl}/api/v1/session`, {
          headers: { "x-forwarded-for": "203.0.113.60" }
        })
      )
    );

    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(collectSetCookies(response)).toHaveLength(0);
      const body = (await response.json()) as { sessionId: string | null };
      expect(body.sessionId).toBeNull();
    }
  });

  it("analysis submitted right after first visit stays visible to its creator", async () => {
    const session = createSession({ ip: "203.0.113.61" });

    // Simulate the first-visit fan-out: several concurrent session reads.
    await Promise.all([
      session.getJson("/api/v1/session"),
      session.getJson("/api/v1/session"),
      session.getJson("/api/v1/session")
    ]);

    // The submission itself mints the one and only session cookie.
    const create = await session.postJson<{ analysisId?: string }>("/api/v1/analysis", {
      inputType: "PASTE_CODE",
      code: COMPLETE_SNIPPET,
      chainId: 8453
    });
    expect(create.status).toBe(202);
    expect(create.body.analysisId).toBeTruthy();

    // Creator visibility: the status endpoint must resolve immediately for the
    // same cookie jar — this is exactly what 404'd under the race.
    const status = await session.getJson<{ analysisId?: string }>(
      `/api/v1/analysis/${create.body.analysisId}`
    );
    expect(status.status).toBe(200);
    expect(status.body.analysisId).toBe(create.body.analysisId);

    // A later session read reports the minted session and does not rotate it.
    const after = await session.getJson<{ sessionId: string | null }>("/api/v1/session");
    expect(after.status).toBe(200);
    expect(after.body.sessionId).toBeTruthy();
  });
});
