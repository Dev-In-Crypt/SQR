import { keccak256, toBytes } from "viem";

import { canonicalJson } from "@/lib/canonical-json";

export function hashCanonical(value: unknown): string {
  return keccak256(toBytes(canonicalJson(value)));
}

export function shortHash(value: string): string {
  return hashCanonical(value).slice(0, 10);
}
