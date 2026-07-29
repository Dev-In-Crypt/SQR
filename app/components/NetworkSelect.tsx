"use client";

import type { AnalysisNetwork } from "@/app/hooks/useAnalysisNetworks";

export function NetworkSelect({
  networks,
  value,
  onChange
}: {
  networks: AnalysisNetwork[];
  value: number;
  onChange: (chainId: number) => void;
}) {
  if (networks.length <= 1) {
    return null;
  }

  return (
    <label className="stack home-input-group">
      <span>Network</span>
      <select className="select" value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {networks.map((network) => (
          <option key={network.chainId} value={network.chainId}>
            {network.label}
          </option>
        ))}
      </select>
    </label>
  );
}
