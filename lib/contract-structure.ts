import { extractSolidityPragmaFromFiles } from "@/lib/solidity-pragma";
import type {
  SourceBundle,
  StructuredAuditContext,
  StructuredAuthorizationGuard,
  StructuredCallSite,
  StructuredCounterOrTotal,
  StructuredFundControlFunction,
  StructuredLoopLocation,
  StructuredMappingTracker,
  StructuredModifier,
  StructuredProgressionIndicator,
  StructuredRoleOrPrivilege,
  StructuredStateFlowGate,
  StructuredStateMutatingFunction,
  StructuredStateVariable,
  StructuredTokenInteractionSite,
  StructuredValueTransferFunction
} from "@/lib/types";

interface ContractRange {
  name: string;
  filePath: string;
  content: string;
  sanitizedContent: string;
  bodyStart: number;
  bodyEnd: number;
}

interface FunctionRange {
  contractName: string;
  filePath: string;
  content: string;
  sanitizedContent: string;
  name: string;
  qualifiersRaw: string;
  bodyStart: number;
  bodyEnd: number;
  line: number;
  visibility: string;
  mutability: string;
  modifiers: string[];
}

interface ModifierRange {
  contractName: string;
  filePath: string;
  content: string;
  sanitizedContent: string;
  name: string;
  bodyStart: number;
  bodyEnd: number;
  line: number;
}

interface GuardExtraction {
  expression: string;
  line: number;
}

interface FunctionSignals {
  guardConditions: string[];
  guardRoleHints: string[];
  transferMethods: string[];
  hasBalanceCheck: boolean;
  usesPlannedValues: boolean;
  usesLoop: boolean;
}

interface TopLevelStatement {
  statement: string;
  startIndex: number;
}

const ROLE_LIKE_NAME =
  /(owner|admin|govern(or|ance)?|treasury|operator|manager|controller|guardian|signer|pauser|arbiter|buyer|seller|payer|payee|beneficiary|recipient)/i;
const FUND_PAYOUT_NAME = /(payout|release|claim|distribute|settle|pay|unlock)/i;
const FUND_REFUND_NAME = /(refund|reimburse|returnFunds|returnPayment|repay)/i;
const FUND_CANCEL_NAME = /(cancel|abort|terminate|revoke|void)/i;
const FUND_WITHDRAW_NAME = /(withdraw|sweep|rescue|collect|drain)/i;
const FLAG_LIKE_NAME = /(cancel|release|refund|withdraw|pause|active|closed|open|locked|complete|finish|final)/i;
const MILESTONE_LIKE_NAME = /(milestone|stage|phase|step|epoch|round|tranche|releaseIndex|currentMilestone|nextMilestone)/i;
const COUNTER_LIKE_NAME = /(count|counter|index|nonce|cursor|processed|claimed|released)/i;
const TOTAL_LIKE_NAME = /(total|sum|supply|aggregate|debt|stake|borrow|escrowed|locked|deposited|withdrawn|released|refunded)/i;
const PLANNED_VALUE_NAME = /(plan|planned|milestone|schedule|allocation|target|expected|amounts?|tranches?)/i;

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right);
}

function countNewlines(text: string): number {
  let total = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      total += 1;
    }
  }
  return total;
}

function lineNumberAt(content: string, index: number): number {
  if (index <= 0) {
    return 1;
  }

  const bounded = Math.min(index, content.length);
  return countNewlines(content.slice(0, bounded)) + 1;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeContentPreserveLayout(content: string): string {
  let output = "";
  let i = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  while (i < content.length) {
    const char = content[i] || "";
    const next = content[i + 1] || "";

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        output += "\n";
      } else {
        output += " ";
      }
      i += 1;
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        output += "  ";
        i += 2;
        inBlockComment = false;
        continue;
      }

      output += char === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }

    if (inSingleQuote) {
      output += char;
      if (char === "\\") {
        output += next;
        i += 2;
        continue;
      }
      if (char === "'") {
        inSingleQuote = false;
      }
      i += 1;
      continue;
    }

    if (inDoubleQuote) {
      output += char;
      if (char === "\\") {
        output += next;
        i += 2;
        continue;
      }
      if (char === '"') {
        inDoubleQuote = false;
      }
      i += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      output += "  ";
      i += 2;
      inLineComment = true;
      continue;
    }

    if (char === "/" && next === "*") {
      output += "  ";
      i += 2;
      inBlockComment = true;
      continue;
    }

    if (char === "'") {
      output += char;
      inSingleQuote = true;
      i += 1;
      continue;
    }

    if (char === '"') {
      output += char;
      inDoubleQuote = true;
      i += 1;
      continue;
    }

    output += char;
    i += 1;
  }

  return output;
}

function findMatchingBrace(content: string, openBraceIndex: number): number {
  let depth = 0;

  for (let i = openBraceIndex; i < content.length; i += 1) {
    const char = content[i];
    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function findMatchingParen(content: string, openParenIndex: number): number {
  let depth = 0;

  for (let i = openParenIndex; i < content.length; i += 1) {
    const char = content[i];
    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

function dedupeByKey<T>(items: T[], keyOf: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyOf(item);
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return [...map.values()];
}

function sortUniqueStrings(items: string[]): string[] {
  return [...new Set(items.filter((item) => item.length > 0))].sort(compareStrings);
}

function firstTopLevelArgument(value: string): string {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i] || "";
    const next = value[i + 1] || "";

    if (inSingleQuote) {
      if (char === "\\") {
        i += 1;
        continue;
      }
      if (char === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      if (char === "\\") {
        i += 1;
        continue;
      }
      if (char === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (char === "'") {
      inSingleQuote = true;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      continue;
    }

    if (char === "(" || char === "[" || char === "{") {
      if (char === "(") parenDepth += 1;
      if (char === "[") bracketDepth += 1;
      if (char === "{") braceDepth += 1;
      continue;
    }

    if (char === ")" || char === "]" || char === "}") {
      if (char === ")" && parenDepth > 0) parenDepth -= 1;
      if (char === "]" && bracketDepth > 0) bracketDepth -= 1;
      if (char === "}" && braceDepth > 0) braceDepth -= 1;
      continue;
    }

    if (char === "," && parenDepth === 0 && bracketDepth === 0 && braceDepth === 0) {
      return value.slice(0, i).trim();
    }

    if (char === "/" && next === "/") {
      while (i < value.length && value[i] !== "\n") {
        i += 1;
      }
      continue;
    }
  }

  return value.trim();
}

function parseFunctionQualifiers(qualifiersRaw: string): { visibility: string; mutability: string } {
  const qualifiers = qualifiersRaw.toLowerCase();
  const visibilityMatch = qualifiers.match(/\b(public|external|internal|private)\b/);
  const mutabilityMatch = qualifiers.match(/\b(view|pure|payable)\b/);

  return {
    visibility: visibilityMatch?.[1] || "unspecified",
    mutability: mutabilityMatch?.[1] || "nonpayable"
  };
}

function extractModifierNamesFromQualifiers(qualifiersRaw: string): string[] {
  const withoutReturns = qualifiersRaw.replace(/\breturns\s*\([^\)]*\)/g, " ");
  const tokenPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
  const ignored = new Set([
    "public",
    "external",
    "internal",
    "private",
    "view",
    "pure",
    "payable",
    "virtual",
    "override",
    "returns",
    "memory",
    "calldata",
    "storage"
  ]);

  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(withoutReturns)) !== null) {
    const name = match[1];
    if (!name || ignored.has(name.toLowerCase())) {
      continue;
    }
    names.push(name);
  }

  return sortUniqueStrings(names);
}

function extractContracts(sourceBundle: SourceBundle): ContractRange[] {
  const contracts: ContractRange[] = [];
  const contractPattern = /\b(contract|library|interface)\s+([A-Za-z_][A-Za-z0-9_]*)[^\{;]*\{/g;

  for (const file of sourceBundle.files) {
    const content = file.content;
    const sanitizedContent = sanitizeContentPreserveLayout(content);
    let match: RegExpExecArray | null;

    while ((match = contractPattern.exec(sanitizedContent)) !== null) {
      const name = match[2];
      if (!name) {
        continue;
      }

      const matchText = match[0] || "";
      const openOffset = matchText.lastIndexOf("{");
      if (openOffset < 0) {
        continue;
      }

      const openBraceIndex = match.index + openOffset;
      const closeBraceIndex = findMatchingBrace(sanitizedContent, openBraceIndex);
      if (closeBraceIndex <= openBraceIndex) {
        continue;
      }

      contracts.push({
        name,
        filePath: file.path,
        content,
        sanitizedContent,
        bodyStart: openBraceIndex + 1,
        bodyEnd: closeBraceIndex
      });
    }
  }

  contracts.sort((a, b) => compareStrings(`${a.filePath}:${a.name}:${a.bodyStart}`, `${b.filePath}:${b.name}:${b.bodyStart}`));
  return dedupeByKey(contracts, (item) => `${item.filePath}:${item.name}:${item.bodyStart}`);
}

function extractFunctions(contracts: ContractRange[]): FunctionRange[] {
  const functions: FunctionRange[] = [];
  const functionPattern = /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^\)]*\)\s*([^\{;]*)\{/g;

  for (const contract of contracts) {
    const contractBody = contract.sanitizedContent.slice(contract.bodyStart, contract.bodyEnd);
    let match: RegExpExecArray | null;

    while ((match = functionPattern.exec(contractBody)) !== null) {
      const name = match[1];
      if (!name) {
        continue;
      }

      const matchText = match[0] || "";
      const openOffset = matchText.lastIndexOf("{");
      if (openOffset < 0) {
        continue;
      }

      const localOpenIndex = match.index + openOffset;
      const globalOpenIndex = contract.bodyStart + localOpenIndex;
      const globalCloseIndex = findMatchingBrace(contract.sanitizedContent, globalOpenIndex);
      if (globalCloseIndex <= globalOpenIndex || globalCloseIndex > contract.bodyEnd) {
        continue;
      }

      const qualifiersRaw = normalizeWhitespace(match[2] || "");
      const parsedQualifiers = parseFunctionQualifiers(qualifiersRaw);

      functions.push({
        contractName: contract.name,
        filePath: contract.filePath,
        content: contract.content,
        sanitizedContent: contract.sanitizedContent,
        name,
        qualifiersRaw,
        bodyStart: globalOpenIndex + 1,
        bodyEnd: globalCloseIndex,
        line: lineNumberAt(contract.content, match.index + contract.bodyStart),
        visibility: parsedQualifiers.visibility,
        mutability: parsedQualifiers.mutability,
        modifiers: extractModifierNamesFromQualifiers(qualifiersRaw)
      });
    }
  }

  functions.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.name}:${a.bodyStart}`, `${b.filePath}:${b.contractName}:${b.name}:${b.bodyStart}`));
  return dedupeByKey(functions, (item) => `${item.filePath}:${item.contractName}:${item.name}:${item.bodyStart}`);
}

function extractModifierRanges(contracts: ContractRange[]): ModifierRange[] {
  const modifiers: ModifierRange[] = [];
  const modifierPattern = /\bmodifier\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^\)]*\))?\s*\{/g;

  for (const contract of contracts) {
    const contractBody = contract.sanitizedContent.slice(contract.bodyStart, contract.bodyEnd);
    let match: RegExpExecArray | null;

    while ((match = modifierPattern.exec(contractBody)) !== null) {
      const name = match[1];
      if (!name) {
        continue;
      }

      const matchText = match[0] || "";
      const openOffset = matchText.lastIndexOf("{");
      if (openOffset < 0) {
        continue;
      }

      const localOpenIndex = match.index + openOffset;
      const globalOpenIndex = contract.bodyStart + localOpenIndex;
      const globalCloseIndex = findMatchingBrace(contract.sanitizedContent, globalOpenIndex);
      if (globalCloseIndex <= globalOpenIndex || globalCloseIndex > contract.bodyEnd) {
        continue;
      }

      modifiers.push({
        contractName: contract.name,
        filePath: contract.filePath,
        content: contract.content,
        sanitizedContent: contract.sanitizedContent,
        name,
        bodyStart: globalOpenIndex + 1,
        bodyEnd: globalCloseIndex,
        line: lineNumberAt(contract.content, match.index + contract.bodyStart)
      });
    }
  }

  modifiers.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.name}:${a.line}`, `${b.filePath}:${b.contractName}:${b.name}:${b.line}`));
  return dedupeByKey(modifiers, (item) => `${item.filePath}:${item.contractName}:${item.name}:${item.line}`);
}

function extractTopLevelStatements(contract: ContractRange): TopLevelStatement[] {
  const statements: TopLevelStatement[] = [];
  const content = contract.content;
  const sanitized = contract.sanitizedContent;
  let depth = 0;
  let statementStart = -1;

  for (let i = contract.bodyStart; i < contract.bodyEnd; i += 1) {
    const rawChar = content[i] || "";
    const char = sanitized[i] || "";

    if (depth === 0 && statementStart < 0 && rawChar.trim().length > 0) {
      statementStart = i;
    }

    if (char === "{") {
      depth += 1;
      if (depth === 1) {
        statementStart = -1;
      }
      continue;
    }

    if (char === "}") {
      if (depth > 0) {
        depth -= 1;
      }
      continue;
    }

    if (char === ";" && depth === 0) {
      if (statementStart >= 0) {
        statements.push({
          statement: content.slice(statementStart, i + 1),
          startIndex: statementStart
        });
      }
      statementStart = -1;
    }
  }

  return statements;
}

function parseStateVariable(statementRaw: string): { name: string; type: string; declaration: string } | null {
  const declaration = normalizeWhitespace(statementRaw);
  if (!declaration.endsWith(";")) {
    return null;
  }

  if (/^(event|error|struct|enum|using|modifier|function|constructor|type)\b/i.test(declaration)) {
    return null;
  }

  const withoutSemicolon = declaration.slice(0, -1).trim();
  const initializerIndex = findTopLevelInitializerIndex(withoutSemicolon);
  const withoutInitializer =
    initializerIndex >= 0 ? withoutSemicolon.slice(0, initializerIndex).trim() : withoutSemicolon;
  const nameMatch = /([A-Za-z_][A-Za-z0-9_]*)\s*(\[[^\]]*\]\s*)*$/.exec(withoutInitializer);
  if (!nameMatch?.[1]) {
    return null;
  }

  const name = nameMatch[1];
  const type = withoutInitializer.slice(0, nameMatch.index).trim();
  if (!type) {
    return null;
  }

  return {
    name,
    type,
    declaration
  };
}

function findTopLevelInitializerIndex(value: string): number {
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i] || "";
    const next = value[i + 1] || "";
    const prev = value[i - 1] || "";

    if (char === "(") parenDepth += 1;
    if (char === "[") bracketDepth += 1;
    if (char === "{") braceDepth += 1;
    if (char === ")" && parenDepth > 0) parenDepth -= 1;
    if (char === "]" && bracketDepth > 0) bracketDepth -= 1;
    if (char === "}" && braceDepth > 0) braceDepth -= 1;

    if (char !== "=" || parenDepth > 0 || bracketDepth > 0 || braceDepth > 0) {
      continue;
    }

    if (next === ">" || prev === "=" || prev === ">" || next === "=") {
      continue;
    }

    return i;
  }

  return -1;
}

function inferStateVariableFlags(params: {
  name: string;
  type: string;
  declaration: string;
}): Pick<
  StructuredStateVariable,
  | "isMapping"
  | "isArray"
  | "isRoleLike"
  | "isFlagLike"
  | "isCounterLike"
  | "isTotalLike"
  | "isMilestoneLike"
> {
  const normalizedName = params.name.toLowerCase();
  const normalizedType = params.type.toLowerCase();
  const normalizedDeclaration = params.declaration.toLowerCase();

  const isMapping = /\bmapping\s*\(/i.test(params.type);
  const isArray = /\[[^\]]*\]/.test(params.type) || /\[[^\]]*\]/.test(params.declaration);
  const isAddressLike = /\baddress\b/.test(normalizedType);
  const isBoolLike = /\bbool\b/.test(normalizedType) || /^is[A-Z]/.test(params.name);

  return {
    isMapping,
    isArray,
    isRoleLike: ROLE_LIKE_NAME.test(params.name) || (isAddressLike && ROLE_LIKE_NAME.test(normalizedName)),
    isFlagLike: isBoolLike || FLAG_LIKE_NAME.test(params.name),
    isCounterLike: /\buint\d*\b/.test(normalizedType) && COUNTER_LIKE_NAME.test(params.name),
    isTotalLike: /\buint\d*\b/.test(normalizedType) && TOTAL_LIKE_NAME.test(params.name),
    isMilestoneLike:
      MILESTONE_LIKE_NAME.test(params.name) ||
      MILESTONE_LIKE_NAME.test(normalizedDeclaration) ||
      /\benum\b/.test(normalizedType)
  };
}

function extractStateVariables(contracts: ContractRange[]): StructuredStateVariable[] {
  const variables: StructuredStateVariable[] = [];

  for (const contract of contracts) {
    const statements = extractTopLevelStatements(contract);

    for (const item of statements) {
      const parsed = parseStateVariable(item.statement);
      if (!parsed) {
        continue;
      }

      const flags = inferStateVariableFlags(parsed);
      variables.push({
        contractName: contract.name,
        name: parsed.name,
        type: parsed.type,
        declaration: parsed.declaration,
        ...flags,
        filePath: contract.filePath,
        line: lineNumberAt(contract.content, item.startIndex)
      });
    }
  }

  variables.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.name}:${a.line}`, `${b.filePath}:${b.contractName}:${b.name}:${b.line}`));
  return dedupeByKey(variables, (item) => `${item.filePath}:${item.contractName}:${item.name}:${item.line}`);
}

function extractRequireGuardsFromRange(params: {
  content: string;
  sanitizedContent: string;
  bodyStart: number;
  bodyEnd: number;
}): GuardExtraction[] {
  const guards: GuardExtraction[] = [];
  const localSanitized = params.sanitizedContent.slice(params.bodyStart, params.bodyEnd);
  const requirePattern = /\brequire\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = requirePattern.exec(localSanitized)) !== null) {
    const openParenOffset = match[0].lastIndexOf("(");
    const localOpenIndex = match.index + openParenOffset;
    const localCloseIndex = findMatchingParen(localSanitized, localOpenIndex);
    if (localCloseIndex <= localOpenIndex) {
      continue;
    }

    const globalOpenIndex = params.bodyStart + localOpenIndex;
    const globalCloseIndex = params.bodyStart + localCloseIndex;
    const rawArgs = params.content.slice(globalOpenIndex + 1, globalCloseIndex);
    const expression = normalizeWhitespace(firstTopLevelArgument(rawArgs));
    if (!expression) {
      continue;
    }

    guards.push({
      expression,
      line: lineNumberAt(params.content, globalOpenIndex)
    });

    requirePattern.lastIndex = localCloseIndex + 1;
  }

  guards.sort((a, b) => compareStrings(`${a.line}:${a.expression}`, `${b.line}:${b.expression}`));
  return dedupeByKey(guards, (item) => `${item.line}:${item.expression}`);
}

function extractIfConditions(fn: FunctionRange): GuardExtraction[] {
  const conditions: GuardExtraction[] = [];
  const localSanitized = fn.sanitizedContent.slice(fn.bodyStart, fn.bodyEnd);
  const ifPattern = /\bif\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = ifPattern.exec(localSanitized)) !== null) {
    const openParenOffset = match[0].lastIndexOf("(");
    const localOpenIndex = match.index + openParenOffset;
    const localCloseIndex = findMatchingParen(localSanitized, localOpenIndex);
    if (localCloseIndex <= localOpenIndex) {
      continue;
    }

    const globalOpenIndex = fn.bodyStart + localOpenIndex;
    const globalCloseIndex = fn.bodyStart + localCloseIndex;
    const expression = normalizeWhitespace(fn.content.slice(globalOpenIndex + 1, globalCloseIndex));
    if (!expression) {
      continue;
    }

    conditions.push({
      expression,
      line: lineNumberAt(fn.content, globalOpenIndex)
    });
    ifPattern.lastIndex = localCloseIndex + 1;
  }

  conditions.sort((a, b) => compareStrings(`${a.line}:${a.expression}`, `${b.line}:${b.expression}`));
  return dedupeByKey(conditions, (item) => `${item.line}:${item.expression}`);
}

function extractRoleHintsFromExpression(expression: string): string[] {
  const hints: string[] = [];
  const normalizedExpression = normalizeWhitespace(expression);

  const senderEqPattern = /msg\.sender\s*==\s*([A-Za-z_][A-Za-z0-9_\.]*)/g;
  let match: RegExpExecArray | null;
  while ((match = senderEqPattern.exec(normalizedExpression)) !== null) {
    const candidate = match[1];
    if (candidate) {
      hints.push(candidate);
    }
  }

  const senderEqReversePattern = /([A-Za-z_][A-Za-z0-9_\.]*)\s*==\s*msg\.sender/g;
  while ((match = senderEqReversePattern.exec(normalizedExpression)) !== null) {
    const candidate = match[1];
    if (candidate) {
      hints.push(candidate);
    }
  }

  const hasRolePattern = /\bhasRole\s*\(\s*([^,\)]+)\s*,\s*msg\.sender\s*\)/g;
  while ((match = hasRolePattern.exec(normalizedExpression)) !== null) {
    const candidate = normalizeWhitespace(match[1] || "");
    if (candidate) {
      hints.push(candidate);
    }
  }

  if (normalizedExpression.includes("msg.sender") && hints.length === 0) {
    hints.push("msg.sender");
  }

  const roleWords = normalizedExpression.match(/[A-Za-z_][A-Za-z0-9_]*/g) || [];
  for (const word of roleWords) {
    if (ROLE_LIKE_NAME.test(word)) {
      hints.push(word);
    }
  }

  return sortUniqueStrings(hints);
}

function extractModifiers(modifierRanges: ModifierRange[]): StructuredModifier[] {
  const modifiers: StructuredModifier[] = [];

  for (const modifierRange of modifierRanges) {
    const guardExpressions = extractRequireGuardsFromRange(modifierRange).map((guard) => guard.expression);
    const roleHints = sortUniqueStrings(guardExpressions.flatMap((expression) => extractRoleHintsFromExpression(expression)));

    modifiers.push({
      contractName: modifierRange.contractName,
      name: modifierRange.name,
      filePath: modifierRange.filePath,
      line: modifierRange.line,
      guardExpressions,
      roleHints
    });
  }

  modifiers.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.name}:${a.line}`, `${b.filePath}:${b.contractName}:${b.name}:${b.line}`));
  return dedupeByKey(modifiers, (item) => `${item.filePath}:${item.contractName}:${item.name}:${item.line}`);
}

function buildModifierIndex(modifiers: StructuredModifier[]): Map<string, StructuredModifier> {
  const index = new Map<string, StructuredModifier>();
  for (const modifier of modifiers) {
    index.set(`${modifier.contractName}:${modifier.name}`, modifier);
  }
  return index;
}

function extractAuthorizationGuards(params: {
  functions: FunctionRange[];
  modifiers: StructuredModifier[];
  functionRequireGuards: Map<string, GuardExtraction[]>;
}): StructuredAuthorizationGuard[] {
  const guards: StructuredAuthorizationGuard[] = [];
  const modifierIndex = buildModifierIndex(params.modifiers);

  for (const fn of params.functions) {
    const functionKey = `${fn.filePath}:${fn.contractName}:${fn.name}:${fn.bodyStart}`;
    const requireGuards = params.functionRequireGuards.get(functionKey) || [];
    for (const requireGuard of requireGuards) {
      const roleHints = extractRoleHintsFromExpression(requireGuard.expression);
      if (roleHints.length === 0 && !requireGuard.expression.includes("msg.sender")) {
        continue;
      }

      guards.push({
        contractName: fn.contractName,
        functionName: fn.name,
        source: "require",
        expression: requireGuard.expression,
        roleHints,
        filePath: fn.filePath,
        line: requireGuard.line
      });
    }

    for (const modifierName of fn.modifiers) {
      const modifier = modifierIndex.get(`${fn.contractName}:${modifierName}`);
      const roleHints = sortUniqueStrings([
        ...(modifier?.roleHints || []),
        ...(ROLE_LIKE_NAME.test(modifierName) || /^(only|auth)/i.test(modifierName) ? [modifierName] : [])
      ]);

      if (roleHints.length === 0 && !/^(only|auth)/i.test(modifierName)) {
        continue;
      }

      const modifierExpressions = modifier?.guardExpressions.length
        ? modifier.guardExpressions
        : [`modifier ${modifierName}`];

      for (const expression of modifierExpressions) {
        guards.push({
          contractName: fn.contractName,
          functionName: fn.name,
          source: "modifier",
          expression,
          roleHints,
          filePath: fn.filePath,
          line: fn.line
        });
      }
    }
  }

  guards.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.functionName}:${a.line}:${a.source}:${a.expression}`, `${b.filePath}:${b.contractName}:${b.functionName}:${b.line}:${b.source}:${b.expression}`));
  return dedupeByKey(guards, (item) => `${item.filePath}:${item.contractName}:${item.functionName}:${item.line}:${item.source}:${item.expression}`);
}

function extractRolesOrPrivileges(params: {
  stateVariables: StructuredStateVariable[];
  modifiers: StructuredModifier[];
  authorizationGuards: StructuredAuthorizationGuard[];
}): StructuredRoleOrPrivilege[] {
  const roles: StructuredRoleOrPrivilege[] = [];

  for (const variable of params.stateVariables) {
    if (!variable.isRoleLike) {
      continue;
    }

    roles.push({
      contractName: variable.contractName,
      name: variable.name,
      kind: "state_var",
      sourceFunction: null,
      matchedExpression: null,
      filePath: variable.filePath,
      line: variable.line
    });
  }

  for (const modifier of params.modifiers) {
    if (!ROLE_LIKE_NAME.test(modifier.name) && !/^(only|auth)/i.test(modifier.name) && modifier.roleHints.length === 0) {
      continue;
    }

    roles.push({
      contractName: modifier.contractName,
      name: modifier.name,
      kind: "modifier",
      sourceFunction: null,
      matchedExpression: modifier.guardExpressions[0] || null,
      filePath: modifier.filePath,
      line: modifier.line
    });
  }

  for (const guard of params.authorizationGuards) {
    const guardNames = guard.roleHints.length > 0 ? guard.roleHints : ["msg.sender guard"];
    for (const name of guardNames) {
      if (!ROLE_LIKE_NAME.test(name) && name !== "msg.sender" && name !== "msg.sender guard") {
        continue;
      }

      roles.push({
        contractName: guard.contractName,
        name,
        kind: "guard",
        sourceFunction: guard.functionName,
        matchedExpression: guard.expression,
        filePath: guard.filePath,
        line: guard.line
      });
    }
  }

  roles.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.name}:${a.kind}:${a.line}`, `${b.filePath}:${b.contractName}:${b.name}:${b.kind}:${b.line}`));
  return dedupeByKey(roles, (item) => `${item.filePath}:${item.contractName}:${item.name}:${item.kind}:${item.line}`);
}

function extractExternalCallSites(functions: FunctionRange[]): StructuredCallSite[] {
  const sites: StructuredCallSite[] = [];
  const pattern = /([A-Za-z_][A-Za-z0-9_\.]*)\s*\.\s*(call|delegatecall|staticcall|send|transfer)\s*(?:\{[^\}]*\})?\s*\(/g;

  for (const fn of functions) {
    const body = fn.sanitizedContent.slice(fn.bodyStart, fn.bodyEnd);
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(body)) !== null) {
      const target = match[1] || "unknown";
      const callType = match[2] || "call";

      sites.push({
        contractName: fn.contractName,
        functionName: fn.name,
        callType,
        target,
        filePath: fn.filePath,
        line: lineNumberAt(fn.content, fn.bodyStart + match.index)
      });
    }
  }

  sites.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.functionName}:${a.line}:${a.callType}:${a.target}`, `${b.filePath}:${b.contractName}:${b.functionName}:${b.line}:${b.callType}:${b.target}`));
  return dedupeByKey(sites, (item) => `${item.filePath}:${item.contractName}:${item.functionName}:${item.line}:${item.callType}:${item.target}`);
}

function extractTokenInteractionSites(functions: FunctionRange[]): StructuredTokenInteractionSite[] {
  const sites: StructuredTokenInteractionSite[] = [];
  const pattern =
    /([A-Za-z_][A-Za-z0-9_\.]*)\s*\.\s*(transferFrom|safeTransferFrom|transfer|safeTransfer|approve|safeApprove|increaseAllowance|decreaseAllowance|balanceOf)\s*\(/g;

  for (const fn of functions) {
    const body = fn.sanitizedContent.slice(fn.bodyStart, fn.bodyEnd);
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(body)) !== null) {
      const target = match[1] || "unknown";
      const method = match[2] || "unknown";

      sites.push({
        contractName: fn.contractName,
        functionName: fn.name,
        method,
        target,
        filePath: fn.filePath,
        line: lineNumberAt(fn.content, fn.bodyStart + match.index)
      });
    }
  }

  sites.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.functionName}:${a.line}:${a.method}:${a.target}`, `${b.filePath}:${b.contractName}:${b.functionName}:${b.line}:${b.method}:${b.target}`));
  return dedupeByKey(sites, (item) => `${item.filePath}:${item.contractName}:${item.functionName}:${item.line}:${item.method}:${item.target}`);
}

function extractLoopLocations(functions: FunctionRange[]): StructuredLoopLocation[] {
  const loops: StructuredLoopLocation[] = [];
  const pattern = /\b(for|while)\s*\(|\bdo\s*\{/g;

  for (const fn of functions) {
    const body = fn.sanitizedContent.slice(fn.bodyStart, fn.bodyEnd);
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(body)) !== null) {
      const rawType = match[1];
      const loopType: "for" | "while" | "do" = rawType === "for" || rawType === "while" ? rawType : "do";

      loops.push({
        contractName: fn.contractName,
        functionName: fn.name,
        loopType,
        filePath: fn.filePath,
        line: lineNumberAt(fn.content, fn.bodyStart + match.index)
      });
    }
  }

  loops.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.functionName}:${a.line}:${a.loopType}`, `${b.filePath}:${b.contractName}:${b.functionName}:${b.line}:${b.loopType}`));
  return dedupeByKey(loops, (item) => `${item.filePath}:${item.contractName}:${item.functionName}:${item.line}:${item.loopType}`);
}

function detectNativeTransferSignals(fn: FunctionRange): string[] {
  const body = fn.sanitizedContent.slice(fn.bodyStart, fn.bodyEnd);
  const signals: string[] = [];

  if (/\.call\s*\{[^\}]*\bvalue\s*:/.test(body)) {
    signals.push("native_call_value");
  }
  if (/\.send\s*\(/.test(body)) {
    signals.push("native_send");
  }
  if (/\.transfer\s*\(/.test(body)) {
    signals.push("native_transfer");
  }

  return sortUniqueStrings(signals);
}

function detectFunctionSignals(params: {
  fn: FunctionRange;
  authorizationGuards: StructuredAuthorizationGuard[];
  functionRequireGuards: Map<string, GuardExtraction[]>;
  tokenInteractionSites: StructuredTokenInteractionSite[];
  externalCallSites: StructuredCallSite[];
  loopLocations: StructuredLoopLocation[];
  stateVariables: StructuredStateVariable[];
  modifiers: StructuredModifier[];
}): FunctionSignals {
  const functionKey = `${params.fn.filePath}:${params.fn.contractName}:${params.fn.name}:${params.fn.bodyStart}`;
  const requireConditions = (params.functionRequireGuards.get(functionKey) || []).map((item) => item.expression);
  const ifConditions = extractIfConditions(params.fn).map((item) => item.expression);
  const modifierConditions = params.fn.modifiers.map((modifierName) => `modifier ${modifierName}`);

  const guardsForFunction = params.authorizationGuards.filter(
    (guard) =>
      guard.filePath === params.fn.filePath &&
      guard.contractName === params.fn.contractName &&
      guard.functionName === params.fn.name
  );

  const roleHints = sortUniqueStrings([
    ...guardsForFunction.flatMap((guard) => guard.roleHints),
    ...params.fn.modifiers.filter((name) => ROLE_LIKE_NAME.test(name) || /^(only|auth)/i.test(name))
  ]);

  const tokenMethods = params.tokenInteractionSites
    .filter(
      (site) =>
        site.filePath === params.fn.filePath &&
        site.contractName === params.fn.contractName &&
        site.functionName === params.fn.name
    )
    .map((site) => `token.${site.method}`);

  const externalMethods = params.externalCallSites
    .filter(
      (site) =>
        site.filePath === params.fn.filePath &&
        site.contractName === params.fn.contractName &&
        site.functionName === params.fn.name
    )
    .map((site) => `${site.target}.${site.callType}`);

  const transferMethods = sortUniqueStrings([...tokenMethods, ...externalMethods, ...detectNativeTransferSignals(params.fn)]);
  const body = params.fn.sanitizedContent.slice(params.fn.bodyStart, params.fn.bodyEnd);
  const hasBalanceCheck =
    tokenMethods.some((item) => item === "token.balanceOf") ||
    /address\s*\(\s*this\s*\)\s*\.\s*balance/.test(body) ||
    /\.balance\s*[<>!=]=?/.test(body);

  const contractStateVars = params.stateVariables.filter(
    (variable) =>
      variable.filePath === params.fn.filePath && variable.contractName === params.fn.contractName
  );
  const plannedVariables = contractStateVars
    .filter((variable) => PLANNED_VALUE_NAME.test(variable.name) || PLANNED_VALUE_NAME.test(variable.declaration))
    .map((variable) => variable.name);

  const usesPlannedValues = plannedVariables.some((name) => new RegExp(`\\b${escapeRegex(name)}\\b`).test(body));
  const usesLoop = params.loopLocations.some(
    (loop) =>
      loop.filePath === params.fn.filePath &&
      loop.contractName === params.fn.contractName &&
      loop.functionName === params.fn.name
  );

  const modifierRoleHints = params.fn.modifiers.flatMap((modifierName) => {
    const modifier = params.modifiers.find(
      (item) => item.contractName === params.fn.contractName && item.name === modifierName
    );
    return modifier?.roleHints || [];
  });

  return {
    guardConditions: sortUniqueStrings([...requireConditions, ...ifConditions, ...modifierConditions]),
    guardRoleHints: sortUniqueStrings([...roleHints, ...modifierRoleHints]),
    transferMethods,
    hasBalanceCheck,
    usesPlannedValues,
    usesLoop
  };
}

function extractStateMutatingFunctions(params: {
  functions: FunctionRange[];
  functionSignals: Map<string, FunctionSignals>;
}): StructuredStateMutatingFunction[] {
  const mutating: StructuredStateMutatingFunction[] = [];

  for (const fn of params.functions) {
    if (fn.mutability === "view" || fn.mutability === "pure") {
      continue;
    }

    const body = fn.sanitizedContent.slice(fn.bodyStart, fn.bodyEnd);
    const hasAssignment =
      /(^|[^=!<>])=(?!=)/m.test(body) || /\+\+|--|\+=|-=|\*=|\/=|%=/.test(body) || /\bdelete\s+[A-Za-z_]/.test(body);
    const functionKey = `${fn.filePath}:${fn.contractName}:${fn.name}:${fn.bodyStart}`;
    const signals = params.functionSignals.get(functionKey);
    const hasTransferLikeSignal = (signals?.transferMethods.length || 0) > 0;

    if (!hasAssignment && !hasTransferLikeSignal) {
      continue;
    }

    mutating.push({
      contractName: fn.contractName,
      functionName: fn.name,
      visibility: fn.visibility,
      mutability: fn.mutability,
      modifiers: fn.modifiers,
      guardConditions: signals?.guardConditions || [],
      filePath: fn.filePath,
      line: fn.line
    });
  }

  mutating.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.functionName}:${a.line}`, `${b.filePath}:${b.contractName}:${b.functionName}:${b.line}`));
  return dedupeByKey(mutating, (item) => `${item.filePath}:${item.contractName}:${item.functionName}:${item.line}`);
}

function extractValueTransferFunctions(params: {
  functions: FunctionRange[];
  functionSignals: Map<string, FunctionSignals>;
}): StructuredValueTransferFunction[] {
  const transferFunctions: StructuredValueTransferFunction[] = [];

  for (const fn of params.functions) {
    const functionKey = `${fn.filePath}:${fn.contractName}:${fn.name}:${fn.bodyStart}`;
    const transferMethods = params.functionSignals.get(functionKey)?.transferMethods || [];
    if (transferMethods.length === 0) {
      continue;
    }

    const transferKinds = sortUniqueStrings(
      transferMethods.map((method) => {
        if (method.includes("transferFrom") || method.includes("safeTransferFrom")) {
          return "token_transferFrom";
        }
        if (method.includes("transfer") || method.includes("safeTransfer")) {
          return "token_transfer";
        }
        if (method.includes("native_call_value")) {
          return "native_call_value";
        }
        if (method.includes("native_send")) {
          return "native_send";
        }
        if (method.includes("native_transfer")) {
          return "native_transfer";
        }
        if (method.includes(".call")) {
          return "low_level_call";
        }
        return "external_value_flow";
      })
    );

    transferFunctions.push({
      contractName: fn.contractName,
      functionName: fn.name,
      transferKinds,
      transferSites: transferMethods,
      filePath: fn.filePath,
      line: fn.line
    });
  }

  transferFunctions.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.functionName}:${a.line}`, `${b.filePath}:${b.contractName}:${b.functionName}:${b.line}`));
  return dedupeByKey(transferFunctions, (item) => `${item.filePath}:${item.contractName}:${item.functionName}:${item.line}`);
}

function functionMutatesVariable(fn: FunctionRange, variableName: string): boolean {
  const body = fn.sanitizedContent.slice(fn.bodyStart, fn.bodyEnd);
  const escaped = escapeRegex(variableName);

  const directMutationPattern = new RegExp(`\\b${escaped}\\b\\s*(?:\\+\\+|--|\\+=|-=|\\*=|/=|%=|=)`);
  const reverseMutationPattern = new RegExp(`(?:\\+\\+|--)\\s*\\b${escaped}\\b`);
  const deletePattern = new RegExp(`\\bdelete\\s+${escaped}\\b`);
  const arrayPushPattern = new RegExp(`\\b${escaped}\\s*\\.\\s*(?:push|pop)\\s*\\(`);
  const mappingMutationPattern = new RegExp(`\\b${escaped}\\s*\\[[^\\]]+\\]\\s*(?:\\+\\+|--|\\+=|-=|\\*=|/=|%=|=)`);

  return (
    directMutationPattern.test(body) ||
    reverseMutationPattern.test(body) ||
    deletePattern.test(body) ||
    arrayPushPattern.test(body) ||
    mappingMutationPattern.test(body)
  );
}

function extractStateFlowGates(params: {
  stateVariables: StructuredStateVariable[];
  functions: FunctionRange[];
  functionSignals: Map<string, FunctionSignals>;
}): StructuredStateFlowGate[] {
  const gates: StructuredStateFlowGate[] = [];
  const flagVariables = params.stateVariables.filter((variable) => variable.isFlagLike);

  for (const variable of flagVariables) {
    const gatedFunctions: string[] = [];
    const conditions: string[] = [];
    const variablePattern = new RegExp(`\\b${escapeRegex(variable.name)}\\b`);

    for (const fn of params.functions) {
      if (fn.filePath !== variable.filePath || fn.contractName !== variable.contractName) {
        continue;
      }

      const functionKey = `${fn.filePath}:${fn.contractName}:${fn.name}:${fn.bodyStart}`;
      const functionConditions = params.functionSignals.get(functionKey)?.guardConditions || [];
      const matchingConditions = functionConditions.filter((condition) => variablePattern.test(condition));
      if (matchingConditions.length === 0) {
        continue;
      }

      gatedFunctions.push(fn.name);
      conditions.push(...matchingConditions);
    }

    if (gatedFunctions.length === 0) {
      continue;
    }

    gates.push({
      contractName: variable.contractName,
      variableName: variable.name,
      gatedFunctions: sortUniqueStrings(gatedFunctions),
      conditions: sortUniqueStrings(conditions),
      filePath: variable.filePath,
      line: variable.line
    });
  }

  gates.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.variableName}:${a.line}`, `${b.filePath}:${b.contractName}:${b.variableName}:${b.line}`));
  return dedupeByKey(gates, (item) => `${item.filePath}:${item.contractName}:${item.variableName}:${item.line}`);
}

function extractProgressionIndicators(params: {
  stateVariables: StructuredStateVariable[];
  functions: FunctionRange[];
}): StructuredProgressionIndicator[] {
  const indicators: StructuredProgressionIndicator[] = [];
  const candidates = params.stateVariables.filter((variable) => variable.isMilestoneLike);

  for (const variable of candidates) {
    const updatedInFunctions = params.functions
      .filter((fn) => fn.filePath === variable.filePath && fn.contractName === variable.contractName)
      .filter((fn) => functionMutatesVariable(fn, variable.name))
      .map((fn) => fn.name);

    indicators.push({
      contractName: variable.contractName,
      variableName: variable.name,
      declaration: variable.declaration,
      updatedInFunctions: sortUniqueStrings(updatedInFunctions),
      filePath: variable.filePath,
      line: variable.line
    });
  }

  indicators.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.variableName}:${a.line}`, `${b.filePath}:${b.contractName}:${b.variableName}:${b.line}`));
  return dedupeByKey(indicators, (item) => `${item.filePath}:${item.contractName}:${item.variableName}:${item.line}`);
}

function extractCountersAndTotals(params: {
  stateVariables: StructuredStateVariable[];
  functions: FunctionRange[];
}): StructuredCounterOrTotal[] {
  const countersAndTotals: StructuredCounterOrTotal[] = [];
  const candidates = params.stateVariables.filter((variable) => variable.isCounterLike || variable.isTotalLike);

  for (const variable of candidates) {
    const updatedInFunctions = params.functions
      .filter((fn) => fn.filePath === variable.filePath && fn.contractName === variable.contractName)
      .filter((fn) => functionMutatesVariable(fn, variable.name))
      .map((fn) => fn.name);

    countersAndTotals.push({
      contractName: variable.contractName,
      variableName: variable.name,
      declaration: variable.declaration,
      kind: variable.isTotalLike ? "total" : "counter",
      updatedInFunctions: sortUniqueStrings(updatedInFunctions),
      filePath: variable.filePath,
      line: variable.line
    });
  }

  countersAndTotals.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.variableName}:${a.kind}:${a.line}`, `${b.filePath}:${b.contractName}:${b.variableName}:${b.kind}:${b.line}`));
  return dedupeByKey(countersAndTotals, (item) => `${item.filePath}:${item.contractName}:${item.variableName}:${item.kind}:${item.line}`);
}

function extractMappings(params: {
  stateVariables: StructuredStateVariable[];
  functions: FunctionRange[];
}): StructuredMappingTracker[] {
  const trackers: StructuredMappingTracker[] = [];
  const mappings = params.stateVariables.filter((variable) => variable.isMapping);

  for (const variable of mappings) {
    const valueTypeMatch = variable.declaration.match(/mapping\s*\([^=]+=>\s*([^\)]+)\)/i);
    const valueType = normalizeWhitespace(valueTypeMatch?.[1] || "unknown");

    const updatedInFunctions = params.functions
      .filter((fn) => fn.filePath === variable.filePath && fn.contractName === variable.contractName)
      .filter((fn) => functionMutatesVariable(fn, variable.name))
      .map((fn) => fn.name);

    trackers.push({
      contractName: variable.contractName,
      variableName: variable.name,
      declaration: variable.declaration,
      valueType,
      updatedInFunctions: sortUniqueStrings(updatedInFunctions),
      filePath: variable.filePath,
      line: variable.line
    });
  }

  trackers.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.variableName}:${a.line}`, `${b.filePath}:${b.contractName}:${b.variableName}:${b.line}`));
  return dedupeByKey(trackers, (item) => `${item.filePath}:${item.contractName}:${item.variableName}:${item.line}`);
}

function classifyFundControlActions(fn: FunctionRange, transferMethods: string[]): Array<StructuredFundControlFunction["action"]> {
  const actions: Array<StructuredFundControlFunction["action"]> = [];
  const functionName = fn.name;

  if (FUND_CANCEL_NAME.test(functionName)) {
    actions.push("cancel");
  }
  if (FUND_REFUND_NAME.test(functionName)) {
    actions.push("refund");
  }
  if (FUND_WITHDRAW_NAME.test(functionName)) {
    actions.push("withdrawal");
  }
  if (FUND_PAYOUT_NAME.test(functionName) || transferMethods.length > 0) {
    actions.push("payout");
  }

  return sortUniqueStrings(actions) as Array<StructuredFundControlFunction["action"]>;
}

function normalizeCallableBy(fn: FunctionRange, roleHints: string[]): string[] {
  const hints = sortUniqueStrings(roleHints);
  if (hints.length > 0) {
    return hints;
  }

  if (fn.visibility === "public" || fn.visibility === "external" || fn.visibility === "unspecified") {
    return ["any external caller"];
  }

  return ["internal flow"];
}

function buildFundControlMap(params: {
  functions: FunctionRange[];
  stateMutatingFunctions: StructuredStateMutatingFunction[];
  functionSignals: Map<string, FunctionSignals>;
  rolesOrPrivilegedAddresses: StructuredRoleOrPrivilege[];
}): {
  fundControlMap: StructuredAuditContext["fundControlMap"];
  logicSummaries: string[];
} {
  const functionControls: StructuredFundControlFunction[] = [];
  const payoutFunctions: string[] = [];
  const refundFunctions: string[] = [];
  const cancellationFunctions: string[] = [];
  const withdrawalFunctions: string[] = [];
  const logicSummaries: string[] = [];

  for (const fn of params.functions) {
    const functionKey = `${fn.filePath}:${fn.contractName}:${fn.name}:${fn.bodyStart}`;
    const signals = params.functionSignals.get(functionKey);
    if (!signals) {
      continue;
    }

    const actions = classifyFundControlActions(fn, signals.transferMethods);
    if (actions.length === 0) {
      continue;
    }

    const callableBy = normalizeCallableBy(fn, signals.guardRoleHints);

    for (const action of actions) {
      const entry: StructuredFundControlFunction = {
        contractName: fn.contractName,
        functionName: fn.name,
        action,
        callableBy,
        guardConditions: signals.guardConditions,
        transferMethods: signals.transferMethods,
        usesPlannedValues: signals.usesPlannedValues,
        usesBalanceChecks: signals.hasBalanceCheck,
        usesLoops: signals.usesLoop,
        filePath: fn.filePath,
        line: fn.line
      };

      functionControls.push(entry);

      if (action === "payout") {
        payoutFunctions.push(fn.name);
      }
      if (action === "refund") {
        refundFunctions.push(fn.name);
      }
      if (action === "cancel") {
        cancellationFunctions.push(fn.name);
      }
      if (action === "withdrawal") {
        withdrawalFunctions.push(fn.name);
      }

      if (callableBy.length > 0) {
        logicSummaries.push(`${action} in ${fn.contractName}.${fn.name} is controlled by ${callableBy.join(" or ")}`);
      }
      if (entry.transferMethods.length > 0) {
        logicSummaries.push(`${fn.contractName}.${fn.name} moves value via ${entry.transferMethods.join(", ")}`);
      }
      if (entry.usesPlannedValues) {
        logicSummaries.push(`${fn.contractName}.${fn.name} derives ${action} flow from planned or milestone-like values`);
      }
      if (entry.transferMethods.some((item) => item.includes("transfer")) && !entry.usesBalanceChecks) {
        logicSummaries.push(`${fn.contractName}.${fn.name} performs transfer flow without explicit balanceOf/native balance check`);
      }
    }
  }

  const privilegedRoles = sortUniqueStrings(params.rolesOrPrivilegedAddresses.map((item) => item.name));
  const notes: string[] = [];

  const hasTokenTransfersWithoutBalanceCheck = functionControls.some(
    (entry) => entry.transferMethods.some((method) => method.includes("transfer")) && !entry.usesBalanceChecks
  );
  if (hasTokenTransfersWithoutBalanceCheck) {
    notes.push("token transfer flows detected without explicit balance check in the same function");
  }

  const hasLoopedFundControl = functionControls.some((entry) => entry.usesLoops);
  if (hasLoopedFundControl) {
    notes.push("fund-control functions with loops detected");
  }

  if (cancellationFunctions.length > 0 && privilegedRoles.length > 0) {
    notes.push("cancellation paths and privileged roles coexist");
  }

  const mutatingNames = params.stateMutatingFunctions.map((item) => item.functionName);
  const implicitFundControlNames = sortUniqueStrings(mutatingNames.filter((name) => FUND_PAYOUT_NAME.test(name)));
  if (implicitFundControlNames.length > payoutFunctions.length) {
    notes.push("additional payout-like mutating functions detected by name heuristic");
  }

  return {
    fundControlMap: {
      payoutFunctions: sortUniqueStrings(payoutFunctions),
      refundFunctions: sortUniqueStrings(refundFunctions),
      cancellationFunctions: sortUniqueStrings(cancellationFunctions),
      withdrawalFunctions: sortUniqueStrings(withdrawalFunctions),
      privilegedRoles,
      functionControls: dedupeByKey(
        functionControls.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.functionName}:${a.action}:${a.line}`, `${b.filePath}:${b.contractName}:${b.functionName}:${b.action}:${b.line}`)),
        (item) => `${item.filePath}:${item.contractName}:${item.functionName}:${item.action}:${item.line}`
      ),
      notes: sortUniqueStrings(notes)
    },
    logicSummaries: sortUniqueStrings(logicSummaries)
  };
}

function resolvePragmaMeta(sourceBundle: SourceBundle): StructuredAuditContext["pragma"] {
  const sourceMeta = sourceBundle.sourceMeta || {};

  const fromMeta = {
    expression: typeof sourceMeta.solidityPragma === "string" ? sourceMeta.solidityPragma : null,
    filePath: typeof sourceMeta.solidityPragmaFilePath === "string" ? sourceMeta.solidityPragmaFilePath : null,
    parseError: typeof sourceMeta.solidityPragmaParseError === "string" ? sourceMeta.solidityPragmaParseError : null
  };

  if (fromMeta.expression || fromMeta.parseError || fromMeta.filePath) {
    return fromMeta;
  }

  const parsed = extractSolidityPragmaFromFiles(sourceBundle.files);
  return {
    expression: parsed?.pragma.expression ?? null,
    filePath: parsed?.filePath ?? null,
    parseError: parsed?.pragma.failureReason ?? null
  };
}

export function buildStructuredAuditContext(sourceBundle: SourceBundle): StructuredAuditContext {
  const contracts = extractContracts(sourceBundle);
  const functions = extractFunctions(contracts);
  const modifierRanges = extractModifierRanges(contracts);
  const modifiers = extractModifiers(modifierRanges);
  const stateVariables = extractStateVariables(contracts);

  const functionRequireGuards = new Map<string, GuardExtraction[]>();
  for (const fn of functions) {
    const guards = extractRequireGuardsFromRange(fn);
    functionRequireGuards.set(`${fn.filePath}:${fn.contractName}:${fn.name}:${fn.bodyStart}`, guards);
  }

  const authorizationGuards = extractAuthorizationGuards({
    functions,
    modifiers,
    functionRequireGuards
  });
  const rolesOrPrivilegedAddresses = extractRolesOrPrivileges({
    stateVariables,
    modifiers,
    authorizationGuards
  });

  const externalCallSites = extractExternalCallSites(functions);
  const tokenInteractionSites = extractTokenInteractionSites(functions);
  const loopLocations = extractLoopLocations(functions);

  const functionSignals = new Map<string, FunctionSignals>();
  for (const fn of functions) {
    const key = `${fn.filePath}:${fn.contractName}:${fn.name}:${fn.bodyStart}`;
    functionSignals.set(
      key,
      detectFunctionSignals({
        fn,
        authorizationGuards,
        functionRequireGuards,
        tokenInteractionSites,
        externalCallSites,
        loopLocations,
        stateVariables,
        modifiers
      })
    );
  }

  const stateMutatingFunctions = extractStateMutatingFunctions({
    functions,
    functionSignals
  });
  const valueTransferFunctions = extractValueTransferFunctions({
    functions,
    functionSignals
  });
  const stateFlowGates = extractStateFlowGates({
    stateVariables,
    functions,
    functionSignals
  });
  const progressionIndicators = extractProgressionIndicators({
    stateVariables,
    functions
  });
  const countersAndTotals = extractCountersAndTotals({
    stateVariables,
    functions
  });
  const mappingTrackers = extractMappings({
    stateVariables,
    functions
  });

  const fundControl = buildFundControlMap({
    functions,
    stateMutatingFunctions,
    functionSignals,
    rolesOrPrivilegedAddresses
  });

  const progressionSummaries = progressionIndicators
    .filter((indicator) => indicator.updatedInFunctions.length > 0)
    .map((indicator) => `${indicator.contractName}.${indicator.variableName} progression changes in ${indicator.updatedInFunctions.join(", ")}`);

  return {
    pragma: resolvePragmaMeta(sourceBundle),
    contractNames: sortUniqueStrings(contracts.map((item) => item.name)),
    modifiers,
    rolesOrPrivilegedAddresses,
    authorizationGuards,
    stateVariables,
    externalCallSites,
    tokenInteractionSites,
    stateMutatingFunctions,
    valueTransferFunctions,
    loopLocations,
    stateFlowGates,
    progressionIndicators,
    countersAndTotals,
    mappingTrackers,
    fundControlMap: fundControl.fundControlMap,
    logicSummaries: sortUniqueStrings([...fundControl.logicSummaries, ...progressionSummaries])
  };
}
