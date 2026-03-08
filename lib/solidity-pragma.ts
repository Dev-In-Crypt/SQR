import type { SourceFile } from "@/lib/types";

export interface SolidityVersion {
  major: number;
  minor: number;
  patch: number;
}

export type SolidityPragmaConstraint =
  | {
      kind: "exact";
      version: SolidityVersion;
    }
  | {
      kind: "caret";
      baseVersion: SolidityVersion;
    }
  | {
      kind: "range";
      minInclusive: SolidityVersion;
      maxExclusive: SolidityVersion;
    };

export interface ParsedSolidityPragma {
  expression: string;
  constraint: SolidityPragmaConstraint | null;
  failureReason?: string;
}

export interface ExtractedSolidityPragma {
  filePath: string;
  pragma: ParsedSolidityPragma;
}

function stripCommentsAndStrings(code: string): string {
  let result = "";
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let delimiter: '"' | "'" | null = null;
  let escaped = false;

  for (let i = 0; i < code.length; i += 1) {
    const char = code[i];
    const next = code[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        result += "\n";
      } else {
        result += " ";
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        result += "  ";
        i += 1;
      } else {
        result += char === "\n" ? "\n" : " ";
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        result += " ";
        continue;
      }
      if (char === "\\") {
        escaped = true;
        result += " ";
        continue;
      }
      if (char === delimiter) {
        inString = false;
        delimiter = null;
      }
      result += char === "\n" ? "\n" : " ";
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      result += "  ";
      i += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      inBlockComment = true;
      result += "  ";
      i += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      delimiter = char;
      result += " ";
      continue;
    }

    result += char;
  }

  return result;
}

export function parseSolidityVersion(value: string): SolidityVersion | null {
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

export function formatSolidityVersion(version: SolidityVersion): string {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function compareSolidityVersion(left: SolidityVersion, right: SolidityVersion): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

export function isVersionCompatibleWithConstraint(
  version: SolidityVersion,
  constraint: SolidityPragmaConstraint
): boolean {
  if (constraint.kind === "exact") {
    return compareSolidityVersion(version, constraint.version) === 0;
  }

  if (constraint.kind === "caret") {
    if (compareSolidityVersion(version, constraint.baseVersion) < 0) {
      return false;
    }

    if (constraint.baseVersion.major === 0) {
      return version.major === 0 && version.minor === constraint.baseVersion.minor;
    }

    return version.major === constraint.baseVersion.major;
  }

  return (
    compareSolidityVersion(version, constraint.minInclusive) >= 0 &&
    compareSolidityVersion(version, constraint.maxExclusive) < 0
  );
}

export function parseSolidityPragmaExpression(expressionRaw: string): ParsedSolidityPragma {
  const expression = expressionRaw.trim().replace(/\s+/g, " ");

  const caretMatch = expression.match(/^\^\s*(\d+\.\d+\.\d+)$/);
  if (caretMatch) {
    const baseVersion = parseSolidityVersion(caretMatch[1]);
    if (!baseVersion) {
      return {
        expression,
        constraint: null,
        failureReason: "UNPARSEABLE_VERSION"
      };
    }

    return {
      expression,
      constraint: {
        kind: "caret",
        baseVersion
      }
    };
  }

  const exactVersion = parseSolidityVersion(expression);
  if (exactVersion) {
    return {
      expression,
      constraint: {
        kind: "exact",
        version: exactVersion
      }
    };
  }

  const rangeMatch = expression.match(/^>=\s*(\d+\.\d+\.\d+)\s*<\s*(\d+\.\d+\.\d+)$/);
  if (rangeMatch) {
    const minInclusive = parseSolidityVersion(rangeMatch[1]);
    const maxExclusive = parseSolidityVersion(rangeMatch[2]);

    if (!minInclusive || !maxExclusive || compareSolidityVersion(minInclusive, maxExclusive) >= 0) {
      return {
        expression,
        constraint: null,
        failureReason: "INVALID_RANGE"
      };
    }

    return {
      expression,
      constraint: {
        kind: "range",
        minInclusive,
        maxExclusive
      }
    };
  }

  return {
    expression,
    constraint: null,
    failureReason: "UNSUPPORTED_PRAGMA_EXPRESSION"
  };
}

export function extractSolidityPragmaFromSource(source: string): ParsedSolidityPragma | null {
  const sanitized = stripCommentsAndStrings(source);
  const match = sanitized.match(/\bpragma\s+solidity\s+([^;]+);/i);
  if (!match || !match[1]) {
    return null;
  }

  return parseSolidityPragmaExpression(match[1]);
}

export function extractSolidityPragmaFromFiles(files: SourceFile[]): ExtractedSolidityPragma | null {
  for (const file of files) {
    const pragma = extractSolidityPragmaFromSource(file.content);
    if (!pragma) {
      continue;
    }

    return {
      filePath: file.path,
      pragma
    };
  }

  return null;
}
