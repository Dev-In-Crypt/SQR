import { extractSolidityPragmaFromFiles } from "@/lib/solidity-pragma";
import type {
  SourceBundle,
  StructuredAuditContext,
  StructuredCallSite,
  StructuredLoopLocation,
  StructuredRoleOrPrivilege,
  StructuredStateMutatingFunction,
  StructuredStateVariable,
  StructuredTokenInteractionSite
} from "@/lib/types";

interface ContractRange {
  name: string;
  filePath: string;
  content: string;
  bodyStart: number;
  bodyEnd: number;
}

interface FunctionRange {
  contractName: string;
  filePath: string;
  content: string;
  name: string;
  bodyStart: number;
  bodyEnd: number;
  line: number;
  visibility: string;
  mutability: string;
}

const PRIVILEGED_NAME = /(owner|admin|govern(or|ance)?|treasury|operator|manager|controller|guardian|signer|pauser)/i;

const FUND_PAYOUT_NAME = /(payout|release|claim|distribute|settle|pay)/i;
const FUND_REFUND_NAME = /(refund|reimburse|returnFunds|returnPayment|repay)/i;
const FUND_CANCEL_NAME = /(cancel|abort|terminate|revoke|void)/i;
const FUND_WITHDRAW_NAME = /(withdraw|sweep|rescue|collect|drain)/i;

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

function extractContracts(sourceBundle: SourceBundle): ContractRange[] {
  const contracts: ContractRange[] = [];
  const contractPattern = /\b(contract|library|interface)\s+([A-Za-z_][A-Za-z0-9_]*)[^\{;]*\{/g;

  for (const file of sourceBundle.files) {
    const content = file.content;
    let match: RegExpExecArray | null;

    while ((match = contractPattern.exec(content)) !== null) {
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
      const closeBraceIndex = findMatchingBrace(content, openBraceIndex);
      if (closeBraceIndex <= openBraceIndex) {
        continue;
      }

      contracts.push({
        name,
        filePath: file.path,
        content,
        bodyStart: openBraceIndex + 1,
        bodyEnd: closeBraceIndex
      });
    }
  }

  contracts.sort((a, b) => compareStrings(`${a.filePath}:${a.name}:${a.bodyStart}`, `${b.filePath}:${b.name}:${b.bodyStart}`));
  return dedupeByKey(contracts, (item) => `${item.filePath}:${item.name}:${item.bodyStart}`);
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

function extractFunctions(contracts: ContractRange[]): FunctionRange[] {
  const functions: FunctionRange[] = [];
  const functionPattern = /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*([^\{;]*)\{/g;

  for (const contract of contracts) {
    const contractBody = contract.content.slice(contract.bodyStart, contract.bodyEnd);
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
      const globalCloseIndex = findMatchingBrace(contract.content, globalOpenIndex);
      if (globalCloseIndex <= globalOpenIndex || globalCloseIndex > contract.bodyEnd) {
        continue;
      }

      const parsedQualifiers = parseFunctionQualifiers(match[2] || "");
      functions.push({
        contractName: contract.name,
        filePath: contract.filePath,
        content: contract.content,
        name,
        bodyStart: globalOpenIndex + 1,
        bodyEnd: globalCloseIndex,
        line: lineNumberAt(contract.content, match.index + contract.bodyStart),
        visibility: parsedQualifiers.visibility,
        mutability: parsedQualifiers.mutability
      });
    }
  }

  functions.sort((a, b) => compareStrings(`${a.filePath}:${a.contractName}:${a.name}:${a.bodyStart}`, `${b.filePath}:${b.contractName}:${b.name}:${b.bodyStart}`));
  return dedupeByKey(functions, (item) => `${item.filePath}:${item.contractName}:${item.name}:${item.bodyStart}`);
}

function extractStateVariables(contracts: ContractRange[], functions: FunctionRange[]): StructuredStateVariable[] {
  const variables: StructuredStateVariable[] = [];

  for (const contract of contracts) {
    const contractFunctions = functions.filter(
      (item) => item.contractName === contract.name && item.filePath === contract.filePath
    );
    const body = contract.content.slice(contract.bodyStart, contract.bodyEnd);
    const lines = body.split(/\r?\n/);
    let localIndex = 0;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const globalStart = contract.bodyStart + localIndex;
      localIndex += rawLine.length + 1;

      const insideFunction = contractFunctions.some(
        (fn) => globalStart >= fn.bodyStart && globalStart <= fn.bodyEnd
      );
      if (insideFunction) {
        continue;
      }

      if (!line || !line.endsWith(";") || line.includes("(") || line.startsWith("//")) {
        continue;
      }
      if (/^(event|error|struct|enum|using|modifier|function|constructor)\b/i.test(line)) {
        continue;
      }
      if (!/\b(address|uint|int|bool|string|bytes|mapping|[A-Z][A-Za-z0-9_]*)\b/.test(line)) {
        continue;
      }

      const nameMatch = line.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:=.+)?;$/);
      if (!nameMatch?.[1]) {
        continue;
      }

      variables.push({
        contractName: contract.name,
        name: nameMatch[1],
        declaration: line,
        filePath: contract.filePath,
        line: lineNumberAt(contract.content, globalStart)
      });
    }
  }

  variables.sort((a, b) =>
    compareStrings(
      `${a.filePath}:${a.contractName}:${a.name}:${a.line}`,
      `${b.filePath}:${b.contractName}:${b.name}:${b.line}`
    )
  );
  return dedupeByKey(variables, (item) => `${item.filePath}:${item.contractName}:${item.name}:${item.line}`);
}

function extractRolesOrPrivileges(
  contracts: ContractRange[],
  functions: FunctionRange[],
  stateVariables: StructuredStateVariable[]
): StructuredRoleOrPrivilege[] {
  const roles: StructuredRoleOrPrivilege[] = [];

  for (const variable of stateVariables) {
    if (!PRIVILEGED_NAME.test(variable.name)) {
      continue;
    }

    roles.push({
      name: variable.name,
      kind: "state_var",
      filePath: variable.filePath,
      line: variable.line
    });
  }

  const modifierPattern = /\bmodifier\s+([A-Za-z_][A-Za-z0-9_]*)\b/g;
  for (const contract of contracts) {
    const body = contract.content.slice(contract.bodyStart, contract.bodyEnd);
    let match: RegExpExecArray | null;

    while ((match = modifierPattern.exec(body)) !== null) {
      const modifierName = match[1];
      if (!modifierName) {
        continue;
      }

      if (!PRIVILEGED_NAME.test(modifierName) && !/^(only|auth)/i.test(modifierName)) {
        continue;
      }

      roles.push({
        name: modifierName,
        kind: "modifier",
        filePath: contract.filePath,
        line: lineNumberAt(contract.content, contract.bodyStart + match.index)
      });
    }
  }

  const guardPattern = /require\s*\(([^\)]*msg\.sender[^\)]*)\)/g;
  for (const fn of functions) {
    const body = fn.content.slice(fn.bodyStart, fn.bodyEnd);
    let match: RegExpExecArray | null;

    while ((match = guardPattern.exec(body)) !== null) {
      const guardExpr = match[1] || "";
      const guardNameMatch =
        guardExpr.match(/msg\.sender\s*==\s*([A-Za-z_][A-Za-z0-9_\.]*)/) ||
        guardExpr.match(/([A-Za-z_][A-Za-z0-9_\.]*)\s*==\s*msg\.sender/);

      const name = guardNameMatch?.[1] || "msg.sender guard";
      if (!PRIVILEGED_NAME.test(name) && name !== "msg.sender guard") {
        continue;
      }

      roles.push({
        name,
        kind: "guard",
        filePath: fn.filePath,
        line: lineNumberAt(fn.content, fn.bodyStart + match.index)
      });
    }
  }

  roles.sort((a, b) => compareStrings(`${a.filePath}:${a.name}:${a.kind}:${a.line}`, `${b.filePath}:${b.name}:${b.kind}:${b.line}`));
  return dedupeByKey(roles, (item) => `${item.filePath}:${item.name}:${item.kind}:${item.line}`);
}

function extractExternalCallSites(functions: FunctionRange[]): StructuredCallSite[] {
  const sites: StructuredCallSite[] = [];
  const pattern =
    /([A-Za-z_][A-Za-z0-9_\.]*)\s*\.\s*(call|delegatecall|staticcall|send|transfer)\s*(?:\{[^\}]*\})?\s*\(/g;

  for (const fn of functions) {
    const body = fn.content.slice(fn.bodyStart, fn.bodyEnd);
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

  sites.sort((a, b) =>
    compareStrings(
      `${a.filePath}:${a.contractName}:${a.functionName}:${a.line}:${a.callType}:${a.target}`,
      `${b.filePath}:${b.contractName}:${b.functionName}:${b.line}:${b.callType}:${b.target}`
    )
  );
  return dedupeByKey(
    sites,
    (item) => `${item.filePath}:${item.contractName}:${item.functionName}:${item.line}:${item.callType}:${item.target}`
  );
}

function extractTokenInteractionSites(functions: FunctionRange[]): StructuredTokenInteractionSite[] {
  const sites: StructuredTokenInteractionSite[] = [];
  const pattern =
    /([A-Za-z_][A-Za-z0-9_\.]*)\s*\.\s*(transferFrom|safeTransferFrom|transfer|safeTransfer|approve|safeApprove|increaseAllowance|decreaseAllowance|balanceOf)\s*\(/g;

  for (const fn of functions) {
    const body = fn.content.slice(fn.bodyStart, fn.bodyEnd);
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

  sites.sort((a, b) =>
    compareStrings(
      `${a.filePath}:${a.contractName}:${a.functionName}:${a.line}:${a.method}:${a.target}`,
      `${b.filePath}:${b.contractName}:${b.functionName}:${b.line}:${b.method}:${b.target}`
    )
  );
  return dedupeByKey(
    sites,
    (item) => `${item.filePath}:${item.contractName}:${item.functionName}:${item.line}:${item.method}:${item.target}`
  );
}

function extractStateMutatingFunctions(functions: FunctionRange[]): StructuredStateMutatingFunction[] {
  const mutating: StructuredStateMutatingFunction[] = [];

  for (const fn of functions) {
    if (fn.mutability === "view" || fn.mutability === "pure") {
      continue;
    }

    const body = fn.content.slice(fn.bodyStart, fn.bodyEnd);
    const hasMutation =
      /(^|[^=!<>])=(?!=)/m.test(body) || /\+\+|--|\+=|-=|\*=|\/=|%=/.test(body) || /\bdelete\s+[A-Za-z_]/.test(body);
    if (!hasMutation) {
      continue;
    }

    mutating.push({
      contractName: fn.contractName,
      functionName: fn.name,
      visibility: fn.visibility,
      mutability: fn.mutability,
      filePath: fn.filePath,
      line: fn.line
    });
  }

  mutating.sort((a, b) =>
    compareStrings(
      `${a.filePath}:${a.contractName}:${a.functionName}:${a.line}`,
      `${b.filePath}:${b.contractName}:${b.functionName}:${b.line}`
    )
  );
  return dedupeByKey(mutating, (item) => `${item.filePath}:${item.contractName}:${item.functionName}:${item.line}`);
}

function extractLoopLocations(functions: FunctionRange[]): StructuredLoopLocation[] {
  const loops: StructuredLoopLocation[] = [];
  const pattern = /\b(for|while)\s*\(|\bdo\s*\{/g;

  for (const fn of functions) {
    const body = fn.content.slice(fn.bodyStart, fn.bodyEnd);
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

  loops.sort((a, b) =>
    compareStrings(
      `${a.filePath}:${a.contractName}:${a.functionName}:${a.line}:${a.loopType}`,
      `${b.filePath}:${b.contractName}:${b.functionName}:${b.line}:${b.loopType}`
    )
  );
  return dedupeByKey(loops, (item) => `${item.filePath}:${item.contractName}:${item.functionName}:${item.line}:${item.loopType}`);
}

function sortUniqueStrings(items: string[]): string[] {
  return [...new Set(items)].sort(compareStrings);
}

function buildFundControlMap(params: {
  stateMutatingFunctions: StructuredStateMutatingFunction[];
  tokenInteractionSites: StructuredTokenInteractionSite[];
  rolesOrPrivilegedAddresses: StructuredRoleOrPrivilege[];
  externalCallSites: StructuredCallSite[];
}): StructuredAuditContext["fundControlMap"] {
  const functionNames = params.stateMutatingFunctions.map((item) => item.functionName);
  const payoutFunctions = sortUniqueStrings(functionNames.filter((name) => FUND_PAYOUT_NAME.test(name)));
  const refundFunctions = sortUniqueStrings(functionNames.filter((name) => FUND_REFUND_NAME.test(name)));
  const cancellationFunctions = sortUniqueStrings(functionNames.filter((name) => FUND_CANCEL_NAME.test(name)));
  const withdrawalFunctions = sortUniqueStrings(functionNames.filter((name) => FUND_WITHDRAW_NAME.test(name)));
  const privilegedRoles = sortUniqueStrings(params.rolesOrPrivilegedAddresses.map((item) => item.name));

  const notes: string[] = [];
  if (params.externalCallSites.length > 0) {
    notes.push("external call sites detected in mutating flow");
  }

  const tokenMethods = params.tokenInteractionSites.map((item) => item.method.toLowerCase());
  const hasTransfers = tokenMethods.some((item) => item.includes("transfer"));
  const hasBalanceReads = tokenMethods.some((item) => item === "balanceof");
  if (hasTransfers && !hasBalanceReads) {
    notes.push("token transfer interactions detected without extracted balanceOf checks");
  }

  if (cancellationFunctions.length > 0 && privilegedRoles.length > 0) {
    notes.push("cancellation paths and privileged roles coexist");
  }

  return {
    payoutFunctions,
    refundFunctions,
    cancellationFunctions,
    withdrawalFunctions,
    privilegedRoles,
    notes: sortUniqueStrings(notes)
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
  const stateVariables = extractStateVariables(contracts, functions);
  const rolesOrPrivilegedAddresses = extractRolesOrPrivileges(contracts, functions, stateVariables);
  const externalCallSites = extractExternalCallSites(functions);
  const tokenInteractionSites = extractTokenInteractionSites(functions);
  const stateMutatingFunctions = extractStateMutatingFunctions(functions);
  const loopLocations = extractLoopLocations(functions);

  return {
    pragma: resolvePragmaMeta(sourceBundle),
    contractNames: sortUniqueStrings(contracts.map((item) => item.name)),
    rolesOrPrivilegedAddresses,
    stateVariables,
    externalCallSites,
    tokenInteractionSites,
    stateMutatingFunctions,
    loopLocations,
    fundControlMap: buildFundControlMap({
      stateMutatingFunctions,
      tokenInteractionSites,
      rolesOrPrivilegedAddresses,
      externalCallSites
    })
  };
}
