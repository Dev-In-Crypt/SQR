"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";

import { analyzeSnippetCompleteness } from "@/lib/snippet-validation";
import { resolveUserErrorMessage } from "@/lib/ui-error-messages";

type InputTab = "PASTE_CODE" | "BASE_ADDRESS";

interface SessionResponse {
  walletAddress: string | null;
}

const INCOMPLETE_SNIPPET_ERROR = "incomplete snippet, please paste full contract";
const INVALID_ADDRESS_WARNING = "invalid address, enter a valid 0x contract address";

export default function HomeForm() {
  const chainId = 8453;
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

  const trimmedCode = code.trim();
  const trimmedAddress = address.trim();

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

  useEffect(() => {
    void refreshSession();
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
              chainId
            }
          : {
              inputType: "BASE_ADDRESS",
              address: trimmedAddress,
              chainId
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
      <div className="home-form-header stack">
        <div className="memo-kicker">Start a review</div>
        <div className="row home-form-meta">
          <span className="badge">Base focused</span>
          <span className="badge">Private reports</span>
          <span className="badge">Memo output</span>
        </div>
      </div>

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
          Contract address
        </button>
      </div>

      <div className="stack home-tab-panel">
        {tab === "PASTE_CODE" ? (
          <label className="stack home-input-group">
            <span>Solidity snippet (max 200 lines)</span>
            <p className="muted home-mode-copy">
              Use this mode for fast pre-deployment review of excerpts, prototypes, or isolated contracts.
            </p>
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
              <span>Wallet authentication is required for verified-address analysis.</span>
              <span className="muted">
                {walletAddress ? `Wallet connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : "Wallet not connected"}
              </span>
            </div>
            <label className="stack">
              <span>Base contract address</span>
              <p className="muted home-mode-copy">
                Use this mode when you want to review verified Base contracts and preserve owner-linked access controls.
              </p>
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

      <div className="home-postscript muted">
        Reports include severity, evidence, remediation direction, ownership controls, and optional onchain provenance.
      </div>

      {error ? <div className="error" role="alert">{error}</div> : null}
    </form>
  );
}
