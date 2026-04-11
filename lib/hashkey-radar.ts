export interface HashkeyRadarEntry {
  slug: string;
  name: string;
  chainId: number;
  address: string;
  reviewedAt: string;
  riskSummary: string;
  topRiskCategories: string[];
  recurringConcern: string;
  reviewNotes: string[];
}

export const HASHKEY_RADAR_ENTRIES: HashkeyRadarEntry[] = [
  {
    slug: "test-usdc-usdt-stableswap",
    name: "StableSwap Pool (TEST USDC, TEST USDT)",
    chainId: 133,
    address: "0xb5de5Fa6436AE3a7E396eF53E0dE0FC5208f61a4",
    reviewedAt: "2026-04-11T11:50:00.000Z",
    riskSummary:
      "Operationally sensitive pool logic. Automated triage highlights governance and accounting checkpoints before broader integration.",
    topRiskCategories: ["Privilege Risk", "Fund Flow Hotspots", "Integration Risk Summary"],
    recurringConcern: "Admin-controlled parameter updates should have explicit governance and monitoring controls.",
    reviewNotes: [
      "Confirm emergency controls and signer policy for privileged functions.",
      "Run invariant tests for withdrawals, pool balance updates, and slippage boundaries.",
      "Require focused manual review before production integrations."
    ]
  },
  {
    slug: "l1block-proxy",
    name: "L1Block Proxy",
    chainId: 133,
    address: "0x4200000000000000000000000000000000000015",
    reviewedAt: "2026-04-11T11:46:00.000Z",
    riskSummary:
      "Upgradeable proxy pattern detected. Upgrade authority controls and implementation change procedures drive most integration risk.",
    topRiskCategories: ["Upgradeability Risk", "Privilege Risk", "Admin & Pause Risk"],
    recurringConcern: "Proxy upgrade authority introduces change-management dependency for downstream integrators.",
    reviewNotes: [
      "Track implementation change events and require approval workflows.",
      "Document rollback and incident procedures tied to upgrade operations.",
      "Treat proxy-admin key management as high priority operational risk."
    ]
  },
  {
    slug: "sample-payfi-treasury",
    name: "Sample PayFi Treasury",
    chainId: 133,
    address: "0x91f4c1cD34d7540D966F26B2A9Dd34f39d8F32c7",
    reviewedAt: "2026-04-11T11:40:00.000Z",
    riskSummary:
      "Treasury settlement flow appears functional but carries accounting drift risk under non-standard token behaviors.",
    topRiskCategories: ["Withdrawal / Accounting / Settlement Risk", "Oracle / Dependency Risk"],
    recurringConcern: "Settlement assumptions must be validated against real token transfer semantics and oracle freshness checks.",
    reviewNotes: [
      "Validate accounting with fee-on-transfer and non-standard ERC20 behavior scenarios.",
      "Add freshness checks for any oracle-dependent payout paths.",
      "Schedule manual audit focused on settlement invariants."
    ]
  }
];

export function findHashkeyRadarEntry(slug: string): HashkeyRadarEntry | null {
  return HASHKEY_RADAR_ENTRIES.find((item) => item.slug === slug) || null;
}
