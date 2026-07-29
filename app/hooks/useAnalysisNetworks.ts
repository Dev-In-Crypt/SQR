"use client";

import { useEffect, useState } from "react";

export interface AnalysisNetwork {
  chainId: number;
  label: string;
}

interface ConfigResponse {
  analysisNetworks?: AnalysisNetwork[];
  receipt?: { requiredChainId?: number };
}

/**
 * Fetches the analysis networks the server currently offers (/api/v1/config)
 * and the network the wallet payment settles on (always Base today,
 * independent of the chosen analysis network). Shared by HomeForm and
 * QuickScanForm so both forms self-correct identically if the currently
 * selected chain is no longer offered.
 */
export function useAnalysisNetworks() {
  const [analysisChainId, setAnalysisChainId] = useState(8453);
  const [networks, setNetworks] = useState<AnalysisNetwork[]>([{ chainId: 8453, label: "Base" }]);
  const [paymentChainId, setPaymentChainId] = useState(8453);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/v1/config", { cache: "no-store" });
        if (!response.ok || !active) return;
        const payload = (await response.json()) as ConfigResponse;

        if (payload.analysisNetworks?.length) {
          const nextNetworks = payload.analysisNetworks;
          setNetworks(nextNetworks);
          setAnalysisChainId((current) =>
            nextNetworks.some((network) => network.chainId === current) ? current : nextNetworks[0].chainId
          );
        }

        if (typeof payload.receipt?.requiredChainId === "number") {
          setPaymentChainId(payload.receipt.requiredChainId);
        }
      } catch {
        /* keep the Base-only defaults */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return { networks, analysisChainId, setAnalysisChainId, paymentChainId };
}
