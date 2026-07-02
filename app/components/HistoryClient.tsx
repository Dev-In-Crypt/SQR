"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type SeverityFilter = "ALL" | "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
type VisibilityFilter = "ALL" | "PRIVATE" | "PUBLIC";
type InputTypeFilter = "ALL" | "PASTE_CODE" | "BASE_ADDRESS";
type ReceiptFilter = "ALL" | "true" | "false";
type SortFilter = "newest" | "oldest";

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

function formatInputType(inputType: string): string {
  if (inputType === "BASE_ADDRESS") {
    return "Verified address";
  }

  if (inputType === "PASTE_CODE") {
    return "Snippet";
  }

  return inputType;
}

function shortenHash(value: string): string {
  if (value.length <= 20) {
    return value;
  }

  return `${value.slice(0, 12)}...${value.slice(-8)}`;
}

export default function HistoryClient() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [severity, setSeverity] = useState<SeverityFilter>("ALL");
  const [visibility, setVisibility] = useState<VisibilityFilter>("ALL");
  const [inputType, setInputType] = useState<InputTypeFilter>("ALL");
  const [hasReceipt, setHasReceipt] = useState<ReceiptFilter>("ALL");
  const [sort, setSort] = useState<SortFilter>("newest");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");

  const fetchPage = useCallback(async (nextCursor?: string | null, reset = false) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: "20" });
      if (nextCursor) {
        params.set("cursor", nextCursor);
      }

      if (severity !== "ALL") {
        params.set("severity", severity);
      }

      if (visibility !== "ALL") {
        params.set("visibility", visibility);
      }

      if (inputType !== "ALL") {
        params.set("inputType", inputType);
      }

      if (hasReceipt !== "ALL") {
        params.set("hasReceipt", hasReceipt);
      }

      if (sort !== "newest") {
        params.set("sort", sort);
      }

      if (query) {
        params.set("query", query);
      }

      const response = await fetch(`/api/v1/history?${params.toString()}`, {
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
  }, [hasReceipt, inputType, query, severity, sort, visibility]);

  useEffect(() => {
    void fetchPage(null, true);
  }, [severity, visibility, inputType, hasReceipt, sort, query]);

  function applySearch() {
    setQuery(queryInput.trim());
  }

  function clearFilters() {
    setSeverity("ALL");
    setVisibility("ALL");
    setInputType("ALL");
    setHasReceipt("ALL");
    setSort("newest");
    setQueryInput("");
    setQuery("");
  }

  return (
    <div className="stack history-archive">
      <div className="card archive-filters stack">
        <div className="section-eyebrow">Filter Archive</div>
        <div className="archive-filter-grid">
          <label className="stack">
            <span className="meta-label">Search</span>
            <input
              className="input"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applySearch();
                }
              }}
              placeholder="Report hash or report id"
            />
          </label>
          <label className="stack">
            <span className="meta-label">Severity</span>
            <select className="select" value={severity} onChange={(event) => setSeverity(event.target.value as SeverityFilter)}>
              <option value="ALL">All</option>
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
              <option value="INFO">Info</option>
            </select>
          </label>
          <label className="stack">
            <span className="meta-label">Visibility</span>
            <select className="select" value={visibility} onChange={(event) => setVisibility(event.target.value as VisibilityFilter)}>
              <option value="ALL">All</option>
              <option value="PRIVATE">Private</option>
              <option value="PUBLIC">Public</option>
            </select>
          </label>
          <label className="stack">
            <span className="meta-label">Input Type</span>
            <select className="select" value={inputType} onChange={(event) => setInputType(event.target.value as InputTypeFilter)}>
              <option value="ALL">All</option>
              <option value="PASTE_CODE">Snippet</option>
              <option value="BASE_ADDRESS">Verified address</option>
            </select>
          </label>
          <label className="stack">
            <span className="meta-label">Receipt</span>
            <select className="select" value={hasReceipt} onChange={(event) => setHasReceipt(event.target.value as ReceiptFilter)}>
              <option value="ALL">All</option>
              <option value="true">Minted</option>
              <option value="false">Offchain only</option>
            </select>
          </label>
          <label className="stack">
            <span className="meta-label">Sort</span>
            <select className="select" value={sort} onChange={(event) => setSort(event.target.value as SortFilter)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        </div>
        <div className="action-group">
          <button className="button" type="button" onClick={applySearch} disabled={loading}>
            Apply search
          </button>
          <button className="button secondary" type="button" onClick={clearFilters} disabled={loading}>
            Reset filters
          </button>
        </div>
      </div>

      {(items.length > 0 || loading) && !error ? (
        <div className="card archive-summary stack">
          <div className="section-eyebrow">Archive Summary</div>
          <div className="archive-summary-row">
            <div className="archive-summary-item stack">
              <span className="meta-label">Loaded reports</span>
              <strong className="overview-value">{items.length}</strong>
            </div>
            <div className="archive-summary-item stack">
              <span className="meta-label">Pagination</span>
              <strong className="archive-summary-text">{cursor ? "More available" : "Current set loaded"}</strong>
            </div>
          </div>
        </div>
      ) : null}

      {items.length === 0 && !loading && !error ? (
        <div className="card archive-empty stack">
          <div className="section-eyebrow">{query || severity !== "ALL" || visibility !== "ALL" || inputType !== "ALL" || hasReceipt !== "ALL" ? "No Matching Reports" : "No Reports Yet"}</div>
          <p className="muted">
            {query || severity !== "ALL" || visibility !== "ALL" || inputType !== "ALL" || hasReceipt !== "ALL"
              ? "No reports matched the current search and filter set. Adjust the archive filters or clear them to broaden the result set."
              : "Run a new review to start building a searchable archive of reports and receipts."}
          </p>
          <div className="action-group">
            {query || severity !== "ALL" || visibility !== "ALL" || inputType !== "ALL" || hasReceipt !== "ALL" ? (
              <button className="button secondary" type="button" onClick={clearFilters}>
                Clear filters
              </button>
            ) : (
              <Link className="button" href="/#analyze">
                New analysis
              </Link>
            )}
          </div>
        </div>
      ) : null}

      {items.map((item) => (
        <article className="card archive-card stack" key={item.reportId}>
          <div className="archive-row">
            <div className="archive-primary stack">
              <div className="row archive-badges">
                <span className={`badge ${item.topSeverity}`}>{item.topSeverity}</span>
                <span className="badge">{item.visibility}</span>
                <span className="badge">{formatInputType(item.inputType)}</span>
                <span className="badge">{item.receipt ? "Receipt minted" : "Offchain only"}</span>
              </div>
              <div className="archive-meta stack">
                <div className="page-meta">{new Date(item.createdAt).toLocaleString()}</div>
                <div className="archive-ledger-row">
                  <span className="muted archive-hash">hash {shortenHash(item.reportHash)}</span>
                  <span className="muted archive-ledger-separator">•</span>
                  <span className="muted">Base ({item.chainId})</span>
                  <span className="muted archive-ledger-separator">•</span>
                  <span className="muted">report {item.reportId.slice(0, 8)}</span>
                </div>
              </div>
            </div>
            <div className="archive-actions action-group">
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
        </article>
      ))}

      {cursor ? (
        <button className="button" type="button" disabled={loading} onClick={() => fetchPage(cursor, false)} aria-busy={loading}>
          {loading ? "Loading..." : "Load more"}
        </button>
      ) : null}

      {error ? <div className="card error">{error}</div> : null}
    </div>
  );
}
