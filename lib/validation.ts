import { z } from "zod";

export const createAnalysisSchema = z
  .object({
    inputType: z.enum(["PASTE_CODE", "BASE_ADDRESS"]),
    reviewMode: z.enum(["STANDARD", "DEFI_PAYFI"]).default("STANDARD"),
    code: z.string().optional(),
    address: z.string().optional(),
    chainId: z.number().int(),
    wallet: z.string().optional()
  })
  .superRefine((value, ctx) => {
    if (value.inputType === "PASTE_CODE" && value.code === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "code is required for PASTE_CODE"
      });
    }

    if (value.inputType === "BASE_ADDRESS" && value.address === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "address is required for BASE_ADDRESS"
      });
    }
  });

export const visibilitySchema = z.object({
  visibility: z.enum(["PRIVATE", "PUBLIC"])
});

export const walletSchema = z.object({
  wallet: z.string().min(1)
});

export const verifyWalletSchema = z.object({
  wallet: z.string().min(1),
  nonce: z.string().min(1),
  signature: z.string().min(1)
});

const hexAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "owner must be a 20-byte hex address");
const hexBytes = z.string().regex(/^0x[a-fA-F0-9]+$/, "signature must be a hex string");
const uintString = z.string().regex(/^\d+$/, "must be an unsigned integer string");

export const receiptConfirmSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "txHash must be a 32-byte hex string"),
  owner: hexAddress,
  nonce: uintString,
  deadline: uintString,
  signature: hexBytes
});
