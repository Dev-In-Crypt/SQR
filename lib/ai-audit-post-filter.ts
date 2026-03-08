import type { AIAuditFinding } from "@/lib/types";

const OPTIONAL_HARDENING_PATTERNS = [
  /\br should be non[- ]?zero\b/i,
  /constructor\s+should\s+emit\s+event/i,
  /consider\s+documenting/i,
  /for\s+clarity/i,
  /could\s+be\s+improved/i,
  /optional\s+hardening/i,
  /best\s+practice\s+only/i
];

const HYPOTHETICAL_PATTERNS = [
  /may\s+become\s+unsafe\s+if\s+code\s+changes\s+later/i,
  /fragile\s+if\s+future\s+external\s+calls\s+are\s+added/i,
  /if\s+future\s+changes?/i,
  /in\s+future\s+refactors?/i,
  /hypothetical/i
];

const WEAKENING_PATTERNS = [
  /\bmitigated\b/i,
  /\bacceptable\b/i,
  /\bby design\b/i,
  /no\s+immediate\s+fix\s+required/i,
  /exploit\s+path\s+is\s+unclear/i,
  /unclear\s+exploit\s+path/i,
  /not\s+immediately\s+exploitable/i
];

const STYLE_GAS_OBSERVABILITY_PATTERNS = [
  /gas\s+optimization/i,
  /style\s+issue/i,
  /naming\s+convention/i,
  /readability/i,
  /code\s+clarity/i,
  /documentation/i,
  /comment\s+quality/i,
  /observability/i,
  /missing\s+event/i
];

const SECURITY_SIGNAL_PATTERNS = [
  /access\s*control/i,
  /auth(orization)?/i,
  /escrow/i,
  /payout/i,
  /refund/i,
  /funds?/i,
  /invariant/i,
  /account(ing)?/i,
  /balance/i,
  /fee[- ]on[- ]transfer/i,
  /deflationary\s+token/i,
  /reentranc/i,
  /state\s+transition/i,
  /cancel/i,
  /seize/i,
  /redirect/i
];

const BUSINESS_LOGIC_KEYWORDS = [
  /unilateral\s+fund\s+control/i,
  /escrow\s+neutrality/i,
  /exact[- ]transfer\s+assumption/i,
  /fee[- ]on[- ]transfer/i,
  /planned\s+values?/i,
  /actual\s+balances?/i,
  /totals?\s+vs\s+components?/i,
  /payout/i,
  /refund/i,
  /cancel/i,
  /arbitration/i
];

function combinedText(finding: AIAuditFinding): string {
  return [finding.title, finding.location, finding.explanation, finding.evidence, finding.fixDirection].join("\n");
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasConcreteEvidence(text: string): boolean {
  return /\brequire\s*\(|\bif\s*\(|\.call\s*\(|delegatecall|transferFrom\s*\(|transfer\s*\(|balanceOf\s*\(|msg\.sender|onlyOwner|nonReentrant|mapping\s*\(/i.test(
    text
  );
}

function titleEvidenceContradict(finding: AIAuditFinding, text: string): boolean {
  const title = finding.title.toLowerCase();

  if ((title.includes("missing access control") || title.includes("no access control")) && /require\s*\(.*msg\.sender|onlyowner|hasrole\s*\(/i.test(text)) {
    return true;
  }

  if ((title.includes("missing event") || title.includes("event not emitted")) && /\bemit\s+[a-z_][a-z0-9_]*\s*\(/i.test(text)) {
    return true;
  }

  if (
    (title.includes("state update after external call") || title.includes("cei") || title.includes("checks-effects-interactions")) &&
    /state\s+updated\s+before\s+(the\s+)?external\s+call|updates?\s+state\s+before\s+call/i.test(text)
  ) {
    return true;
  }

  return false;
}

function isGenericReentrancy(finding: AIAuditFinding, text: string): boolean {
  const isReentrancy = /reentranc/i.test(finding.title) || /reentranc/i.test(finding.explanation);
  if (!isReentrancy) {
    return false;
  }

  if (/state\s+updated\s+before\s+(the\s+)?external\s+call/i.test(text)) {
    return true;
  }

  if (/nonreentrant|reentrancyguard|mutex|lock\w*|state\s+flag\s+blocks?\s+reentry/i.test(text)) {
    return true;
  }

  const hasExternalCallPattern = /\.call\s*\(|delegatecall|send\s*\(|transfer\s*\(|transferFrom\s*\(/i.test(text);
  const hasConcretePath = /re-?enter|reentry\s+path|recursive\s+call|callback\s+path/i.test(text);
  if (!hasExternalCallPattern || !hasConcretePath) {
    return true;
  }

  return false;
}

function isPrivateInternalCeiAdvice(text: string): boolean {
  const ceiMentioned = /cei|checks-effects-interactions|state\s+update\s+after\s+external\s+call/i.test(text);
  if (!ceiMentioned) {
    return false;
  }

  return /(private|internal)\s+function/i.test(text) && /no\s+external\s+call/i.test(text);
}

function isStyleOnly(finding: AIAuditFinding, text: string): boolean {
  if (!matchesAny(text, STYLE_GAS_OBSERVABILITY_PATTERNS)) {
    return false;
  }

  const hasSecuritySignal = matchesAny(text, SECURITY_SIGNAL_PATTERNS);
  if (finding.severity === "INFO") {
    return !hasSecuritySignal;
  }

  return true;
}

function shouldKeepFinding(finding: AIAuditFinding): boolean {
  const text = combinedText(finding);
  const businessLogicSignal = matchesAny(text, BUSINESS_LOGIC_KEYWORDS) && hasConcreteEvidence(text);

  if (matchesAny(text, OPTIONAL_HARDENING_PATTERNS)) {
    return false;
  }

  if (matchesAny(text, HYPOTHETICAL_PATTERNS)) {
    return false;
  }

  if (titleEvidenceContradict(finding, text)) {
    return false;
  }

  if (matchesAny(finding.explanation, WEAKENING_PATTERNS)) {
    return false;
  }

  if ((finding.severity === "HIGH" || finding.severity === "CRITICAL") && /unclear|uncertain|not\s+clear/i.test(finding.explanation)) {
    return false;
  }

  if (isGenericReentrancy(finding, text)) {
    return false;
  }

  if (isPrivateInternalCeiAdvice(text)) {
    return false;
  }

  if (isStyleOnly(finding, text)) {
    return false;
  }

  if (!businessLogicSignal && !hasConcreteEvidence(text) && finding.severity !== "INFO") {
    return false;
  }

  return true;
}

export function filterAIAuditFindings(findings: AIAuditFinding[]): AIAuditFinding[] {
  return findings.filter(shouldKeepFinding);
}
