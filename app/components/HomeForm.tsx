"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import WalletButton from "@/app/components/WalletButton";
import { analyzeSnippetCompleteness } from "@/lib/snippet-validation";

type InputTab = "PASTE_CODE" | "BASE_ADDRESS";

interface SessionResponse {
  walletAddress: string | null;
}

const INCOMPLETE_SNIPPET_ERROR = "incomplete snippet, please paste full contract";

export default function HomeForm() {
  const [tab, setTab] = useState<InputTab>("PASTE_CODE");
  const [code, setCode] = useState("// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\ncontract Sample {\n    uint256 public x;\n}");
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(8453);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const snippetCompleteness = useMemo(() => analyzeSnippetCompleteness(code), [code]);
  const snippetIncomplete = tab === "PASTE_CODE" && !snippetCompleteness.isComplete;

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (tab === "PASTE_CODE") {
      const completeness = analyzeSnippetCompleteness(code);
      if (!completeness.isComplete) {
        setError(INCOMPLETE_SNIPPET_ERROR);
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
              address,
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
        error?: { message?: string };
      };

      if (!response.ok || !json.analysisId) {
        throw new Error(json.error?.message || "Failed to create analysis");
      }

      window.location.href = `/analysis/${json.analysisId}`;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <div className="row">
        <button
          className={`button ${tab === "PASTE_CODE" ? "" : "secondary"}`}
          type="button"
          onClick={() => {
            setTab("PASTE_CODE");
            setError(null);
          }}
        >
          Paste Code
        </button>
        <button
          className={`button ${tab === "BASE_ADDRESS" ? "" : "secondary"}`}
          type="button"
          onClick={() => {
            setTab("BASE_ADDRESS");
            setError(null);
          }}
        >
          Base Address
        </button>
      </div>

      <label className="stack">
        <span>Chain</span>
        <select className="select" value={chainId} onChange={(e) => setChainId(Number(e.target.value))}>
          <option value={8453}>Base Mainnet (8453)</option>
          <option value={84532}>Base Sepolia (84532)</option>
        </select>
      </label>

      {tab === "PASTE_CODE" ? (
        <label className="stack">
          <span>Solidity snippet (max 200 lines)</span>
          <textarea
            className="textarea"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            spellCheck={false}
          />
          {snippetIncomplete ? <span className="error">{INCOMPLETE_SNIPPET_ERROR}</span> : null}
        </label>
      ) : (
        <div className="stack">
          <div className="stack">
            <span>Wallet authentication is required for address analysis.</span>
            <WalletButton onSessionChange={refreshSession} />
            <span className="muted">Current wallet: {walletAddress ?? "not connected"}</span>
          </div>
          <label className="stack">
            <span>Base contract address</span>
            <input
              className="input"
              value={address}
              placeholder="0x..."
              onChange={(event) => setAddress(event.target.value)}
            />
          </label>
        </div>
      )}

      <div className="muted">Reports are private by default. You can generate a share link later.</div>

      <div className="row">
        <button className="button" type="submit" disabled={busy || snippetIncomplete}>
          {busy ? "Submitting..." : "Analyze"}
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}
    </form>
  );
}