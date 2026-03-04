import { describe, expect, it } from "vitest";

import { canonicalJson } from "@/lib/canonical-json";
import { hashCanonical } from "@/lib/hash";

describe("canonicalJson", () => {
  it("produces stable output for key order", () => {
    const a = { b: 2, a: 1, c: { z: 2, y: 1 } };
    const b = { c: { y: 1, z: 2 }, a: 1, b: 2 };

    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(hashCanonical(a)).toBe(hashCanonical(b));
  });

  it("keeps array order deterministic", () => {
    const x = { list: [3, 2, 1] };
    const y = { list: [1, 2, 3] };

    expect(canonicalJson(x)).not.toBe(canonicalJson(y));
    expect(hashCanonical(x)).not.toBe(hashCanonical(y));
  });
});
