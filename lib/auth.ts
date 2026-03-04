import { randomBytes } from "node:crypto";

import { isAddress, verifyMessage } from "viem";

export function normalizeWallet(wallet: string): string {
  return wallet.trim().toLowerCase();
}

export function isValidWallet(wallet: string): boolean {
  return isAddress(wallet);
}

export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

export function buildSignMessage(nonce: string): string {
  return [
    "Sign in to Solidity Quick Review",
    "",
    `Nonce: ${nonce}`,
    "",
    "This signature does not trigger any blockchain transaction."
  ].join("\n");
}

export async function verifyWalletSignature(params: {
  wallet: string;
  nonce: string;
  signature: string;
}): Promise<boolean> {
  const { wallet, nonce, signature } = params;
  const valid = await verifyMessage({
    address: wallet as `0x${string}`,
    message: buildSignMessage(nonce),
    signature: signature as `0x${string}`
  });

  return valid;
}
