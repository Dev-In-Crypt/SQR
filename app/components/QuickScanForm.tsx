"use client";

import { FormEvent, useState } from "react";

import { InputModeTabs } from "@/app/components/InputModeTabs";
import { NetworkSelect } from "@/app/components/NetworkSelect";
import { useAnalysisNetworks } from "@/app/hooks/useAnalysisNetworks";
import { useSolidityInputValidation, type InputTab } from "@/app/hooks/useSolidityInputValidation";
import { resolveUserErrorMessage } from "@/lib/ui-error-messages";

const INCOMPLETE_SNIPPET_ERROR = "incomplete snippet, please paste full contract";
const INVALID_ADDRESS_WARNING = "invalid address, enter a valid 0x contract address";

export default function QuickScanForm() {
  const { networks, analysisChainId, setAnalysisChainId } = useAnalysisNetworks();
  const [tab, setTab] = useState<InputTab>("PASTE_CODE");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { trimmedCode, trimmedAddress, snippetIncomplete, addressInvalid, isSubmittable } =
    useSolidityInputValidation(tab, code, address);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (tab === "PASTE_CODE") {
      if (trimmedCode.length === 0) {
        return;
      }
      if (snippetIncomplete) {
        setError(INCOMPLETE_SNIPPET_ERROR);
        return;
      }
    } else {
      if (trimmedAddress.length === 0) {
        return;
      }
      if (addressInvalid) {
        setError(INVALID_ADDRESS_WARNING);
        return;
      }
    }

    setBusy(true);
    setError(null);

    try {
      const payload =
        tab === "PASTE_CODE"
          ? { inputType: "PASTE_CODE", code, chainId: analysisChainId }
          : { inputType: "BASE_ADDRESS", address: trimmedAddress, chainId: analysisChainId };

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

      <NetworkSelect networks={networks} value={analysisChainId} onChange={setAnalysisChainId} />

      <InputModeTabs
        tab={tab}
        ariaLabel="Quick scan input type"
        onChange={(next) => {
          setTab(next);
          setError(null);
        }}
      />

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
        <button className="button home-submit-button" type="submit" disabled={busy || !isSubmittable}>
          {busy ? "Scanning..." : "Run free quick scan"}
        </button>
      </div>

      {error ? <div className="error" role="alert">{error}</div> : null}
    </form>
  );
}
