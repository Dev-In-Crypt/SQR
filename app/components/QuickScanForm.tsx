"use client";

import { FormEvent, useMemo, useState } from "react";
import { isAddress } from "viem";

import { analyzeSnippetCompleteness } from "@/lib/snippet-validation";
import { resolveUserErrorMessage } from "@/lib/ui-error-messages";

type InputTab = "PASTE_CODE" | "BASE_ADDRESS";

const INCOMPLETE_SNIPPET_ERROR = "incomplete snippet, please paste full contract";
const INVALID_ADDRESS_WARNING = "invalid address, enter a valid 0x contract address";

export default function QuickScanForm() {
  const chainId = 8453;
  const [tab, setTab] = useState<InputTab>("PASTE_CODE");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedCode = code.trim();
  const trimmedAddress = address.trim();
  const snippetCompleteness = useMemo(() => analyzeSnippetCompleteness(code), [code]);
  const snippetIncomplete = !snippetCompleteness.isComplete;
  const addressInvalid = trimmedAddress.length > 0 && !isAddress(trimmedAddress);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (tab === "PASTE_CODE") {
      if (trimmedCode.length === 0) {
        return;
      }
      if (!analyzeSnippetCompleteness(code).isComplete) {
        setError(INCOMPLETE_SNIPPET_ERROR);
        return;
      }
    } else {
      if (trimmedAddress.length === 0) {
        return;
      }
      if (!isAddress(trimmedAddress)) {
        setError(INVALID_ADDRESS_WARNING);
        return;
      }
    }

    setBusy(true);
    setError(null);

    try {
      const payload =
        tab === "PASTE_CODE"
          ? { inputType: "PASTE_CODE", code, chainId }
          : { inputType: "BASE_ADDRESS", address: trimmedAddress, chainId };

      const response = await fetch("/api/v1/analysis/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
            defaultMessage: "Failed to start quick scan"
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
        <div className="memo-kicker">Free quick scan</div>
        <div className="row home-form-meta">
          <span className="badge">No wallet</span>
          <span className="badge">Static checks</span>
          <span className="badge">Instant</span>
        </div>
      </div>

      <div className="home-tab-row" role="tablist" aria-label="Quick scan input type">
        <button
          className={`home-tab ${tab === "PASTE_CODE" ? "is-active" : ""}`}
          aria-pressed={tab === "PASTE_CODE"}
          type="button"
          onClick={() => {
            setTab("PASTE_CODE");
            setError(null);
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
              Fast static screening with no wallet and no account. For the AI-assisted review and
              onchain receipt, run a full analysis from the homepage.
            </p>
            <textarea
              className="textarea home-textarea"
              value={code}
              placeholder={"// Paste contract code for a free static-only quick scan."}
              onChange={(event) => {
                setCode(event.target.value);
                setError(null);
              }}
              spellCheck={false}
            />
          </label>
        ) : (
          <label className="stack home-input-group">
            <span>Base contract address</span>
            <p className="muted home-mode-copy">
              Quick scan reads verified Base source — no wallet needed.
            </p>
            <input
              className="input home-address-input"
              value={address}
              placeholder="0x..."
              onChange={(event) => {
                setAddress(event.target.value);
                setError(null);
              }}
            />
          </label>
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
          {busy ? "Scanning..." : "Run free quick scan"}
        </button>
      </div>

      {error ? <div className="error" role="alert">{error}</div> : null}
    </form>
  );
}
