import type { PartialReasonCode, SnippetCompleteness } from "@/lib/types";

function isWordChar(char: string | undefined): boolean {
  return Boolean(char && /[A-Za-z0-9_]/.test(char));
}

function startsWithWord(source: string, index: number, word: string): boolean {
  if (!source.startsWith(word, index)) {
    return false;
  }

  const prev = source[index - 1];
  const next = source[index + word.length];
  return !isWordChar(prev) && !isWordChar(next);
}

export function analyzeSnippetCompleteness(code: string): SnippetCompleteness {
  let braceBalance = 0;
  const contractBraceStack: number[] = [];

  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let stringDelimiter: "\"" | "'" | null = null;
  let escaped = false;

  let pendingContractKeyword = false;
  let contractEndFound = false;

  for (let i = 0; i < code.length; i += 1) {
    const char = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === stringDelimiter) {
        inString = false;
        stringDelimiter = null;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (char === "\"" || char === "'") {
      inString = true;
      stringDelimiter = char;
      continue;
    }

    if (
      startsWithWord(code, i, "contract") ||
      startsWithWord(code, i, "library") ||
      startsWithWord(code, i, "interface")
    ) {
      pendingContractKeyword = true;
    }

    if (char === "{") {
      braceBalance += 1;
      if (pendingContractKeyword) {
        contractBraceStack.push(braceBalance);
        pendingContractKeyword = false;
      }
      continue;
    }

    if (char === "}") {
      const closedDepth = braceBalance;
      if (braceBalance > 0) {
        braceBalance -= 1;
      } else {
        braceBalance -= 1;
      }

      if (contractBraceStack.length > 0) {
        const activeDepth = contractBraceStack[contractBraceStack.length - 1];
        if (closedDepth === activeDepth) {
          contractBraceStack.pop();
          contractEndFound = true;
        }
      }
    }
  }

  const isComplete = braceBalance === 0 && contractEndFound;
  const reasonCodes: PartialReasonCode[] = isComplete ? [] : ["PARTIAL_SOLIDITY_INCOMPLETE"];

  return {
    braceBalance,
    contractEndFound,
    isComplete,
    reasonCodes
  };
}