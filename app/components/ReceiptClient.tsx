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
            <div className="meta-value mono-wrap">{data?.reportHash}</div>
          </div>
          <div className="metadata-item stack">
            <span className="meta-label">Contract scope</span>
            <div className="meta-value mono-wrap">{data?.report.metadata.contractAddress || "Snippet review"}</div>
          </div>
        </div>

        {data?.receipt ? (
          <div className="stack memo-section">
            <div className="section-eyebrow">Onchain Record</div>
            <div className="metadata-grid">
              <div className="metadata-item stack">
                <span className="meta-label">Transaction hash</span>
                <div className="meta-value mono-wrap">{data.receipt.txHash}</div>
              </div>
              <div className="metadata-item stack">
                <span className="meta-label">Receipt contract</span>
                <div className="meta-value mono-wrap">{data.receipt.contractAddress}</div>
              </div>
              <div className="metadata-item stack">
                <span className="meta-label">Minter</span>
                <div className="meta-value mono-wrap">{data.receipt.receiptMinter}</div>
              </div>
              <div className="metadata-item stack">
                <span className="meta-label">Minted at</span>
                <div className="meta-value">{new Date(data.receipt.mintedAt).toLocaleString()}</div>
              </div>
            </div>
            <Link
              className="button secondary"
              href={`https://basescan.org/tx/${data.receipt.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              Open transaction on BaseScan
            </Link>
          </div>
        ) : (
          <div className="stack note-panel caution-panel">
            <p className="muted">
              No receipt has been minted yet. The review exists offchain, but it does not currently have an onchain
              provenance record.
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
