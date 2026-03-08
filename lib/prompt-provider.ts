function fromEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function getExecutiveSummarySystemPrompt(): string {
  return (
    fromEnv("EXECUTIVE_SUMMARY_SYSTEM_PROMPT") ||
    "You are a Solidity security reviewer. Produce a concise, evidence-based executive summary."
  );
}

export function getSmartContractAuditSystemPrompt(): string {
  return (
    fromEnv("SMART_CONTRACT_AUDIT_SYSTEM_PROMPT") ||
    "You are a senior Solidity security auditor. Return only high-confidence, evidence-based JSON findings."
  );
}
