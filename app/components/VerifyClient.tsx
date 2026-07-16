"use client";

import { useCallback, useEffect, useState } from "react";

type VerifyResult = {
  hash: string;
  verified: boolean;
  network: { chainId: number; label: string };
  onchain:
    | { exists: false }
    | {
        exists: true;
        receiptId: string;
        owner: string;
        contractAddress: string;
        analyzerVersionHash: string;
        timestamp: string;
      };
  record: {
    txHash: string;
    chainId: number;
    mintedAt: string;
    explorerTxUrl: string;
  } | null;
};

type ApiEnvelope = VerifyResult & {
  error?: { code: string; message: string };
};

const REPORT_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export default function VerifyClient({ initialHash }: { initialHash: string | null }) {
  const [hash, setHash] = useState(initialHash ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

  const runVerification = useCallback(async (candidate: string) => {
    const trimmed = candidate.trim();

    if (!REPORT_HASH_PATTERN.test(trimmed)) {
      setError("Enter a valid report hash: 0x followed by 64 hex characters.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`/api/v1/verify?hash=${encodeURIComponent(trimmed)}`);
      const body = (await response.json()) as ApiEnvelope;

      if (!response.ok || body.error) {
        setError(body.error?.message || "Verification failed. Try again.");
        return;
      }

      setResult(body);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialHash && REPORT_HASH_PATTERN.test(initialHash.trim())) {
      void runVerification(initialHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="stack">
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          void runVerification(hash);
        }}
      >
        <label htmlFor="verify-hash">Report hash</label>
        <input
          id="verify-hash"
          className="input"
          placeholder="0x…64 hex characters"
          value={hash}
          onChange={(event) => setHash(event.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <div className="row">
          <button className="button" type="submit" disabled={loading}>
            {loading ? "Checking onchain…" : "Verify receipt"}
          </button>
        </div>
        <p className="muted">
          The hash is checked directly against the ReceiptRegistry contract. No report content is
          revealed — only whether a review receipt for this hash is anchored onchain.
        </p>
      </form>

      {error ? <p className="error">{error}</p> : null}

      {result ? (
        result.verified && result.onchain.exists ? (
          <div className="card stack">
            <h2>Receipt found onchain ✓</h2>
            <p>
              A review receipt for this report hash is anchored on {result.network.label}. The
              report existed in its exact form no later than the receipt timestamp.
            </p>
            <div className="overview-grid">
              <div className="overview-item">
                <span className="muted">Receipt ID</span>
                <span className="overview-value">#{result.onchain.receiptId}</span>
              </div>
              <div className="overview-item">
                <span className="muted">Anchored at</span>
                <span className="overview-value">
                  {new Date(result.onchain.timestamp).toUTCString()}
                </span>
              </div>
              <div className="overview-item">
                <span className="muted">Network</span>
                <span className="overview-value">{result.network.label}</span>
              </div>
            </div>
            <p className="mono-wrap muted">Owner: {result.onchain.owner}</p>
            <p className="mono-wrap muted">Registry: {result.onchain.contractAddress}</p>
            {result.record ? (
              <p>
                <a href={result.record.explorerTxUrl} target="_blank" rel="noreferrer">
                  View mint transaction on explorer →
                </a>
              </p>
            ) : null}
          </div>
        ) : (
          <div className="card stack">
            <h2>No receipt found</h2>
            <p>
              No onchain receipt exists for this hash on {result.network.label}. Either the report
              owner has not minted a receipt, or the hash does not match any reviewed report.
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}
