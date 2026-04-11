"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";

import { analyzeSnippetCompleteness } from "@/lib/snippet-validation";
import { resolveUserErrorMessage } from "@/lib/ui-error-messages";

type InputTab = "PASTE_CODE" | "BASE_ADDRESS";
type ReviewMode = "STANDARD" | "DEFI_PAYFI";

interface SessionResponse {
  walletAddress: string | null;
}

interface RuntimeConfigResponse {
  analysis: {
    defaultChainId: number;
    supportedChains: Array<{
      chainId: number;
      chainHex: `0x${string}`;
      label: string;
      chainName: string;
      nativeCurrency: {
        name: string;
        symbol: string;
        decimals: number;
      };
      explorerBaseUrl: string;
    }>;
    reviewModes: Array<{ value: ReviewMode; label: string }>;
  };
}

const INCOMPLETE_SNIPPET_ERROR = "incomplete snippet, please paste full contract";
const INVALID_ADDRESS_WARNING = "invalid address, enter a valid 0x contract address";

export default function HomeForm() {
  const [tab, setTab] = useState<InputTab>("PASTE_CODE");
  const [reviewMode, setReviewMode] = useState<ReviewMode>("DEFI_PAYFI");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [supportedChains, setSupportedChains] = useState<RuntimeConfigResponse["analysis"]["supportedChains"]>([]);
  const [selectedChainId, setSelectedChainId] = useState<number>(133);
  const [codeInteracted, setCodeInteracted] = useState(false);
  const [addressInteracted, setAddressInteracted] = useState(false);
  const [showSnippetWarning, setShowSnippetWarning] = useState(false);
  const [showAddressWarning, setShowAddressWarning] = useState(false);

  const trimmedCode = code.trim();
  const trimmedAddress = address.trim();

  const snippetCompleteness = useMemo(() => analyzeSnippetCompleteness(code), [code]);
  const snippetIncomplete = !snippetCompleteness.isComplete;
  const addressInvalid = trimmedAddress.length > 0 && !isAddress(trimmedAddress);
  const ctaIdleLabel = tab === "PASTE_CODE" ? "Analyze code" : "Analyze contract";
  const ctaBusyLabel = tab === "PASTE_CODE" ? "Analyzing code..." : "Analyzing contract...";
  const selectedChain = supportedChains.find((item) => item.chainId === selectedChainId) || null;

  async function refreshSession() {
    const response = await fetch("/api/v1/session", { cache: "no-store" });
    if (!response.ok) {
      setWalletAddress(null);
      return;
    }

    const payload = (await response.json()) as SessionResponse;
    setWalletAddress(payload.walletAddress);
  }

  useEffect(() => {
    void refreshSession();

    void (async () => {
      try {
        const response = await fetch("/api/v1/config", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as RuntimeConfigResponse;
        const networks = payload.analysis.supportedChains || [];
        setSupportedChains(networks);
        setSelectedChainId(payload.analysis.defaultChainId || networks[0]?.chainId || 133);
      } catch {
        // Ignore config fetch failure and keep defaults.
      }
    })();
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
              chainId: selectedChainId,
              reviewMode
            }
          : {
              inputType: "BASE_ADDRESS",
              address: trimmedAddress,
              chainId: selectedChainId,
              reviewMode
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
          Verified address
        </button>
      </div>

      <div className="stack home-input-group">
        <label className="stack">
          <span>Network</span>
          <select
            className="input"
            value={selectedChainId}
            onChange={(event) => {
              setSelectedChainId(Number(event.target.value));
              setError(null);
            }}
          >
            {(supportedChains.length > 0
              ? supportedChains
              : [
                  {
                    chainId: 133,
                    chainHex: "0x85" as const,
                    label: "HashKey Testnet",
                    chainName: "HashKey Chain Testnet",
                    nativeCurrency: { name: "HashKey", symbol: "HSK", decimals: 18 },
                    explorerBaseUrl: "https://testnet-explorer.hsk.xyz"
                  }
                ]
            ).map((chain) => (
              <option key={chain.chainId} value={chain.chainId}>
                {chain.label} (chainId {chain.chainId})
              </option>
            ))}
          </select>
        </label>

        <label className="stack">
          <span>Review mode</span>
          <select
            className="input"
            value={reviewMode}
            onChange={(event) => {
              setReviewMode(event.target.value as ReviewMode);
              setError(null);
            }}
          >
            <option value="DEFI_PAYFI">DeFi / PayFi Review Mode</option>
            <option value="STANDARD">Standard Review Mode</option>
          </select>
        </label>
      </div>

      <div className="stack home-tab-panel">
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
              <span>Wallet authentication is required for address analysis.</span>
              <span className="muted">
                {walletAddress ? `Wallet connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Wallet not connected"}
              </span>
            </div>
            <label className="stack">
              <span>{selectedChain ? `${selectedChain.chainName} contract address` : "Contract address"}</span>
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
            {selectedChain ? (
              <span className="muted">
                Verified source will be fetched from {selectedChain.label} explorer before analysis.
              </span>
            ) : null}
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
