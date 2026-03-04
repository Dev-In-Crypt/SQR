import { createHash, randomBytes } from "node:crypto";

import { config } from "@/lib/config";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPrivateToken(token: string): string {
  return sha256Hex(`${token}:${config.PRIVATE_LINK_SECRET}`);
}
