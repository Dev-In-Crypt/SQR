import { describe, expect, it } from "vitest";

import { resolveClientIp } from "@/lib/client-ip";

function headerGetter(map: Record<string, string | null>) {
  return (name: string) => map[name] ?? null;
}

describe("client IP resolver", () => {
  it("prefers trusted direct headers before x-forwarded-for", () => {
    const ip = resolveClientIp({
      getHeader: headerGetter({
        "cf-connecting-ip": "198.51.100.7",
        "x-forwarded-for": "203.0.113.10, 203.0.113.2"
      }),
      trustedHeaders: ["cf-connecting-ip", "x-forwarded-for"],
      trustedProxyHops: 1,
      fallbackIp: "0.0.0.0"
    });

    expect(ip).toBe("198.51.100.7");
  });

  it("extracts client from x-forwarded-for using trusted proxy hops", () => {
    const ip = resolveClientIp({
      getHeader: headerGetter({
        "x-forwarded-for": "198.51.100.1, 198.51.100.2, 198.51.100.3"
      }),
      trustedHeaders: ["x-forwarded-for"],
      trustedProxyHops: 1,
      fallbackIp: "0.0.0.0"
    });

    // With one trusted proxy hop, pick the address before the rightmost proxy.
    expect(ip).toBe("198.51.100.2");
  });

  it("returns fallback for invalid header values", () => {
    const ip = resolveClientIp({
      getHeader: headerGetter({
        "x-real-ip": "unknown",
        "x-forwarded-for": "bad, also-bad"
      }),
      trustedHeaders: ["x-real-ip", "x-forwarded-for"],
      trustedProxyHops: 1,
      fallbackIp: "0.0.0.0"
    });

    expect(ip).toBe("0.0.0.0");
  });
});

