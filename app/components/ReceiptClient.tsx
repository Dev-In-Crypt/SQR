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
    <div className="stack">
      <div className="card stack">
        <h1>Receipt Verification</h1>
        <div>
          <strong>reportHash:</strong> {data?.reportHash}
        </div>

        {data?.receipt ? (
          <>
            <div>
              <strong>txHash:</strong> {data.receipt.txHash}
            </div>
            <div>
              <strong>contractAddress:</strong> {data.receipt.contractAddress}
            </div>
            <div>
              <strong>minter (tx sender):</strong> {data.receipt.receiptMinter}
            </div>
            <div>
              <strong>mintedAt:</strong> {new Date(data.receipt.mintedAt).toLocaleString()}
            </div>
            <Link
              href={`https://basescan.org/tx/${data.receipt.txHash}`}
              target="_blank"
              rel="noreferrer"
            >
              Open transaction on BaseScan
            </Link>
          </>
        ) : (
          <div className="stack">
            <p className="muted">
              No receipt minted yet. This report exists offchain, but has no onchain timestamp proof.
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
