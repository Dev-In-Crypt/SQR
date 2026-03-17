"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";

import { analyzeSnippetCompleteness } from "@/lib/snippet-validation";
import { resolveUserErrorMessage } from "@/lib/ui-error-messages";

type InputTab = "PASTE_CODE" | "BASE_ADDRESS";

interface SessionResponse {
  walletAddress: string | null;
}

interface RuntimeConfigResponse {
  analysis?: {
    defaultChainId?: number;
    supportedNetworks?: Array<{
      chainId: number;
      label: string;
      name: string;
      chainHex: `0x${string}`;
      blockExplorerUrl: string;
    }>;
  };
}

interface AnalysisNetworkOption {
  chainId: number;
  label: string;
}

const DEFAULT_ANALYSIS_NETWORKS: AnalysisNetworkOption[] = [{ chainId: 8453, label: "Base" }];

const INCOMPLETE_SNIPPET_ERROR = "incomplete snippet, please paste full contract";
const INVALID_ADDRESS_WARNING = "invalid address, enter a valid 0x contract address";

export default function HomeForm() {
  const [tab, setTab] = useState<InputTab>("PASTE_CODE");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [codeInteracted, setCodeInteracted] = useState(false);
  const [addressInteracted, setAddressInteracted] = useState(false);
  const [showSnippetWarning, setShowSnippetWarning] = useState(false);
  const [showAddressWarning, setShowAddressWarning] = useState(false);
  const [networkOptions, setNetworkOptions] = useState<AnalysisNetworkOption[]>(DEFAULT_ANALYSIS_NETWORKS);
  const [selectedChainId, setSelectedChainId] = useState<number>(DEFAULT_ANALYSIS_NETWORKS[0].chainId);

  const trimmedCode = code.trim();
  const trimmedAddress = address.trim();
  const selectedNetworkLabel = useMemo(
    () => networkOptions.find((item) => item.chainId === selectedChainId)?.label || `Chain ${selectedChainId}`,
    [networkOptions, selectedChainId]
  );

  const snippetCompleteness = useMemo(() => analyzeSnippetCompleteness(code), [code]);
  const snippetIncomplete = !snippetCompleteness.isComplete;
  const addressInvalid = trimmedAddress.length > 0 && !isAddress(trimmedAddress);
  const ctaIdleLabel = tab === "PASTE_CODE" ? "Analyze code" : "Analyze contract";
  const ctaBusyLabel = tab === "PASTE_CODE" ? "Analyzing code..." : "Analyzing contract...";

  async function refreshSession() {
    const response = await fetch("/api/v1/session", { cache: "no-store" });
    if (!response.ok) {
      setWalletAddress(null);
      return;
    }

    const payload = (await response.json()) as SessionResponse;
    setWalletAddress(payload.walletAddress);
  }

  async function refreshRuntimeConfig() {
    try {
      const response = await fetch("/api/v1/config", { cache: "no-store" });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as RuntimeConfigResponse;
      const supported = (payload.analysis?.supportedNetworks || [])
        .map((item) => ({ chainId: item.chainId, label: item.label }))
        .filter((item) => Number.isInteger(item.chainId));

      if (supported.length === 0) {
        return;
      }

      setNetworkOptions(supported);
      const configuredDefault = payload.analysis?.defaultChainId;

      if (configuredDefault && supported.some((item) => item.chainId === configuredDefault)) {
        setSelectedChainId(configuredDefault);
        return;
      }

      setSelectedChainId((current) =>
        supported.some((item) => item.chainId === current) ? current : supported[0].chainId
      );
    } catch {
      // Keep safe fallback to Base if runtime config is unavailable.
    }
  }

  useEffect(() => {
    void refreshSession();
    void refreshRuntimeConfig();
  }, []);

  useEffect(() => {
    const onSessionChanged = () => {
      void refreshSession();
    };

    window.addEventListener("sqr:session-changed", onSessionChanged);
    return () => window.removeEventListener("sqr:session-changed", onSessionChanged);
  }, []);

  useEffect(() => {
    if (tab !== "PASTE_CODE" || !codeInteracted) {
      setShowSnippetWarning(false);
      return;
    }

    if (trimmedCode.length === 0 || snippetCompleteness.isComplete) {
      setShowSnippetWarning(false);
      return;
    }

    const timer = window.setTimeout(() => {
      const nextIncomplete = !analyzeSnippetCompleteness(code).isComplete;
      setShowSnippetWarning(trimmedCode.length > 0 && nextIncomplete);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [code, codeInteracted, snippetCompleteness.isComplete, tab, trimmedCode.length]);

  useEffect(() => {
    if (tab !== "BASE_ADDRESS" || !addressInteracted) {
      setShowAddressWarning(false);
      return;
    }

    if (trimmedAddress.length === 0 || !addressInvalid) {
      setShowAddressWarning(false);
      return;
    }

    const timer = window.setTimeout(() => {
      const nextAddress = address.trim();
      setShowAddressWarning(nextAddress.length > 0 && !isAddress(nextAddress));
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [address, addressInteracted, addressInvalid, tab, trimmedAddress.length]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (tab === "PASTE_CODE") {
      if (trimmedCode.length === 0) {
        return;
      }

      const completeness = analyzeSnippetCompleteness(code);
      if (!completeness.isComplete) {
        setShowSnippetWarning(true);
        setError(INCOMPLETE_SNIPPET_ERROR);
        return;
      }
    } else {
      if (trimmedAddress.length === 0) {
        return;
      }

      if (!isAddress(trimmedAddress)) {
        setShowAddressWarning(true);
        setError(INVALID_ADDRESS_WARNING);
        return;
      }
    }

    setBusy(true);
    setError(null);

    try {
      const payload =
        tab === "PASTE_CODE"
          ? {
              inputType: "PASTE_CODE",
              code,
              chainId: selectedChainId
            }
          : {
              inputType: "BASE_ADDRESS",
              address: trimmedAddress,
              chainId: selectedChainId
            };

      const response = await fetch("/api/v1/analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const json = (await response.json()) as {
        analysisId?: string;
        error?: { code?: string; message?: string };
      };

      if (!response.ok || !json.analysisId) {
        throw new Error(
          resolveUserErrorMessage({
            code: json.error?.code,
            fallbackMessage: json.error?.message,
            defaultMessage: "Failed to create analysis"
          })
        );
      }

      window.location.href = `/analysis/${json.analysisId}`;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack home-form" onSubmit={onSubmit}>
      <div className="home-tab-row" role="tablist" aria-label="Analyze input type">
        <button
          className={`home-tab ${tab === "PASTE_CODE" ? "is-active" : ""}`}
          aria-pressed={tab === "PASTE_CODE"}
          type="button"
          onClick={() => {
            setTab("PASTE_CODE");
            setError(null);
            setShowAddressWarning(false);
          }}
        >
          Paste code
        </button>
        <button
          className={`home-tab ${tab === "BASE_ADDRESS" ? "is-active" : ""}`}
          aria-pressed={tab === "BASE_ADDRESS"}
          type="button"
          onClick={() => {
            setTab("BASE_ADDRESS");
            setError(null);
            setShowSnippetWarning(false);
          }}
        >
          EVM address
        </button>
      </div>

      <div className="stack home-tab-panel">
        <label className="stack home-input-group">
          <span>EVM network</span>
          <select
            className="select home-network-select"
            value={String(selectedChainId)}
            onChange={(event) => setSelectedChainId(Number(event.target.value))}
          >
            {networkOptions.map((network) => (
              <option key={network.chainId} value={network.chainId}>
                {network.label}
              </option>
            ))}
          </select>
          <span className="muted home-network-hint">Selected network: {selectedNetworkLabel}</span>
        </label>

        {tab === "PASTE_CODE" ? (
          <label className="stack home-input-group">
            <span>Solidity snippet (max 200 lines)</span>
            <textarea
              className="textarea home-textarea"
              aria-invalid={showSnippetWarning}
              value={code}
              placeholder={
                "// Paste your contract code here to scan for common vulnerabilities,\n// gas issues, and risky patterns before deployment."
              }
              onChange={(event) => {
                setCode(event.target.value);
                setCodeInteracted(true);
                setError(null);
              }}
              spellCheck={false}
            />
            {showSnippetWarning ? <span className="error">{INCOMPLETE_SNIPPET_ERROR}</span> : null}
          </label>
        ) : (
          <div className="stack home-input-group">
            <div className="stack home-wallet-state">
              <span>Wallet authentication is required for contract address analysis.</span>
              <span className="muted">
                {walletAddress ? `Wallet connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Wallet not connected"}
              </span>
            </div>
            <label className="stack">
              <span>EVM contract address</span>
              <input
                className="input home-address-input"
                value={address}
                placeholder="0x..."
                aria-invalid={showAddressWarning}
                onChange={(event) => {
                  setAddress(event.target.value);
                  setAddressInteracted(true);
                  setError(null);
                }}
              />
            </label>
            {showAddressWarning ? <span className="error">{INVALID_ADDRESS_WARNING}</span> : null}
          </div>
        )}
      </div>

      <div className="row home-form-actions">
        <button
          className="button home-submit-button"
          type="submit"
          disabled={
            busy ||
            (tab === "PASTE_CODE" && (trimmedCode.length === 0 || snippetIncomplete)) ||
            (tab === "BASE_ADDRESS" && (trimmedAddress.length === 0 || addressInvalid))
          }
        >
          {busy ? ctaBusyLabel : ctaIdleLabel}
        </button>
      </div>

      {error ? <div className="error" role="alert">{error}</div> : null}
    </form>
  );
}
