import { z } from "zod";

export const createAnalysisSchema = z
  .object({
    inputType: z.enum(["PASTE_CODE", "BASE_ADDRESS"]),
    code: z.string().optional(),
    address: z.string().optional(),
    chainId: z.number().int(),
    wallet: z.string().optional()
  })
  .superRefine((value, ctx) => {
    if (value.inputType === "PASTE_CODE" && !value.code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "code is required for PASTE_CODE"
      });
    }

    if (value.inputType === "BASE_ADDRESS" && !value.address) {
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

export const receiptConfirmSchema = z.object({
  txHash: z.string().startsWith("0x")
});

