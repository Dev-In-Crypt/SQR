"use client";

import { useMemo } from "react";
import { isAddress } from "viem";

import { analyzeSnippetCompleteness } from "@/lib/snippet-validation";

export type InputTab = "PASTE_CODE" | "BASE_ADDRESS";

/**
 * Derived validation state shared by HomeForm and QuickScanForm: whether the
 * pasted snippet is a complete contract, whether the address is a valid
 * checksum/format, and whether the current tab's input is submittable.
 */
export function useSolidityInputValidation(tab: InputTab, code: string, address: string) {
  const trimmedCode = code.trim();
  const trimmedAddress = address.trim();
  const snippetCompleteness = useMemo(() => analyzeSnippetCompleteness(code), [code]);
  const snippetIncomplete = !snippetCompleteness.isComplete;
  const addressInvalid = trimmedAddress.length > 0 && !isAddress(trimmedAddress);
  const isSubmittable =
    tab === "PASTE_CODE"
      ? trimmedCode.length > 0 && !snippetIncomplete
      : trimmedAddress.length > 0 && !addressInvalid;

  return {
    trimmedCode,
    trimmedAddress,
    snippetCompleteness,
    snippetIncomplete,
    addressInvalid,
    isSubmittable
  };
}
