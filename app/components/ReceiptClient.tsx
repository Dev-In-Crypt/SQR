"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface ReceiptView {
  reportId: string;
  reportHash: string;
  receipt: {
    txHash: string;
    chainId: number;
    contractAddress: string;
    receiptId: string;
    mintedBy: string;
    receiptOwner: string;
    receiptMinter: string;
    mintedAt: string;
  } | null;
  report: {
    metadata: {
      contractAddress?: string;
      chainId: number;
    };
  };
}

export default function ReceiptClient({ reportId, token }: { reportId: string; token: string | null }) {
  const [data, setData] = useState<ReceiptView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  async function copyValue(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      setTimeout(() => setCopiedField((current) => (current === label ? null : current)), 1200);
    } catch {
      setCopiedField(null);
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(
          `/api/v1/report/${reportId}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
          {
            cache: "no-store"
          }
        );

        const json = (await response.json()) as ReceiptView | { error?: { message?: string } };
        if (!response.ok) {
          throw new Error((json as { error?: { message?: string } }).error?.message || "Failed to load");
        }

        setData(json as ReceiptView);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    }

    void load();
  }, [reportId, token]);

  if (!data && !error) {
    return <div className="card">Loading receipt view...</div>;
  }

  if (!data) {
    return <div className="stack receipt-certificate">{error ? <div className="card error">{error}</div> : null}</div>;
  }

  const receipt = data.receipt;

  return (
    <div className="stack receipt-certificate">
      <div className="card stack memo-surface">
        <div className="section-eyebrow">Verification Certificate</div>
        <h1>Receipt Verification</h1>
        <p className="muted page-intro">
          This page records whether the report has an onchain provenance record and which Base transaction anchored it.
        </p>
        <div className="metadata-grid">
          <div className="metadata-item stack">
            <span className="meta-label">Report hash</span>
            <div className="meta-value mono-wrap">{data.reportHash}</div>
            <button className="button ghost" type="button" onClick={() => void copyValue("report-hash", data.reportHash)}>
              {copiedField === "report-hash" ? "Copied" : "Copy report hash"}
            </button>
          </div>
          <div className="metadata-item stack">
            <span className="meta-label">Contract scope</span>
            <div className="meta-value mono-wrap">{data.report.metadata.contractAddress || "Snippet review"}</div>
          </div>
        </div>

        {receipt ? (
          <div className="stack memo-section">
            <div className="section-eyebrow">Onchain Record</div>
            <h2 style={{ margin: 0 }}>Onchain provenance recorded</h2>
            <p className="muted">
              This review now has a Base transaction proving that the report hash existed in this form at the recorded
              time. It proves provenance, not security certification.
            </p>
            <div className="metadata-grid">
              <div className="metadata-item stack">
                <span className="meta-label">Transaction hash</span>
                <div className="meta-value mono-wrap">{receipt.txHash}</div>
                <button className="button ghost" type="button" onClick={() => void copyValue("tx-hash", receipt.txHash)}>
                  {copiedField === "tx-hash" ? "Copied" : "Copy tx hash"}
                </button>
              </div>
              <div className="metadata-item stack">
                <span className="meta-label">Receipt contract</span>
                <div className="meta-value mono-wrap">{receipt.contractAddress}</div>
                <button className="button ghost" type="button" onClick={() => void copyValue("receipt-contract", receipt.contractAddress)}>
                  {copiedField === "receipt-contract" ? "Copied" : "Copy contract"}
                </button>
              </div>
              <div className="metadata-item stack">
                <span className="meta-label">Receipt minter</span>
                <div className="meta-value mono-wrap">{receipt.receiptMinter}</div>
              </div>
              <div className="metadata-item stack">
                <span className="meta-label">Minted at</span>
                <div className="meta-value">{new Date(receipt.mintedAt).toLocaleString()}</div>
              </div>
              <div className="metadata-item stack">
                <span className="meta-label">Network</span>
                <div className="meta-value">Base Mainnet ({receipt.chainId})</div>
              </div>
              <div className="metadata-item stack">
                <span className="meta-label">Receipt owner</span>
                <div className="meta-value mono-wrap">{receipt.receiptOwner || receipt.mintedBy}</div>
              </div>
            </div>
            <Link
              className="button secondary"
              href={`https://basescan.org/tx/${receipt.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              Open transaction on BaseScan
            </Link>
          </div>
        ) : (
          <div className="stack note-panel caution-panel">
            <div className="section-eyebrow">Offchain Only</div>
            <h2 style={{ margin: 0 }}>No onchain provenance recorded yet</h2>
            <p className="muted">
              No receipt has been minted yet. The review exists offchain, but it does not currently have an onchain
              provenance record. Minting from the owner report view adds a timestamped Base record for this exact report
              hash.
            </p>
            <Link className="button" href={`/report/${reportId}${token ? `?token=${encodeURIComponent(token)}` : ""}`}>
              Open report and mint receipt
            </Link>
          </div>
        )}
      </div>

      {error ? <div className="card error">{error}</div> : null}
    </div>
  );
}
