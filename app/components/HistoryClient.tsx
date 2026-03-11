"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface HistoryItem {
  reportId: string;
  createdAt: string;
  topSeverity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  visibility: "PRIVATE" | "PUBLIC";
  reportHash: string;
  inputType: string;
  chainId: number;
  receipt: { txHash: string } | null;
}

export default function HistoryClient() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchPage(nextCursor?: string | null, reset = false) {
    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({ limit: "20" });
      if (nextCursor) {
        query.set("cursor", nextCursor);
      }

      const response = await fetch(`/api/v1/history?${query.toString()}`, {
        cache: "no-store"
      });
      const json = (await response.json()) as {
        items?: HistoryItem[];
        nextCursor?: string | null;
        error?: { message?: string };
      };

      if (!response.ok || !json.items) {
        throw new Error(json.error?.message || "Failed to load history");
      }

      setItems((prev) => (reset ? json.items! : [...prev, ...json.items!]));
      setCursor(json.nextCursor ?? null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchPage(null, true);
  }, []);

  return (
    <div className="stack">
      <div className="card stack">
        <button className="button secondary" type="button" onClick={() => fetchPage(null, true)}>
          Refresh history
        </button>
      </div>

      {items.map((item) => (
        <div className="card stack" key={item.reportId}>
          <div className="row">
            <span className={`badge ${item.topSeverity}`}>{item.topSeverity}</span>
            <span className="badge">{item.visibility}</span>
            <span className="badge">{item.inputType}</span>
          </div>
          <div className="muted">{new Date(item.createdAt).toLocaleString()}</div>
          <div className="muted">{item.reportHash}</div>
          <div className="row">
            <Link className="button" href={`/report/${item.reportId}`}>
              Open report
            </Link>
            {item.receipt ? (
              <Link className="button secondary" href={`/receipt/${item.reportId}`}>
                Receipt
              </Link>
            ) : null}
          </div>
        </div>
      ))}

      {cursor ? (
        <button className="button" type="button" disabled={loading} onClick={() => fetchPage(cursor, false)}>
          {loading ? "Loading..." : "Load more"}
        </button>
      ) : null}

      {error ? <div className="card error">{error}</div> : null}
    </div>
  );
}
