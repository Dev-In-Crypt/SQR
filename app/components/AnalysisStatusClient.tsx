"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

interface AnalysisStatusResponse {
  analysisId: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "DONE_WITH_WARNINGS" | "FAILED" | "PARTIAL";
  reportId: string | null;
  errorCode: string | null;
  privateToken: string | null;
}

export default function AnalysisStatusClient({ analysisId }: { analysisId: string }) {
  const [data, setData] = useState<AnalysisStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const response = await fetch(`/api/v1/analysis/${analysisId}`, { cache: "no-store" });
        const payload = (await response.json()) as AnalysisStatusResponse | { error?: { message?: string } };

        if (!response.ok) {
          throw new Error((payload as { error?: { message?: string } }).error?.message || "Status failed");
        }

        if (!active) {
          return;
        }

        setData(payload as AnalysisStatusResponse);
      } catch (pollError) {
        if (active) {
          setError(pollError instanceof Error ? pollError.message : String(pollError));
        }
      }
    }

    void poll();
    const timer = setInterval(() => {
      if (
        data?.status === "COMPLETED" ||
        data?.status === "DONE_WITH_WARNINGS" ||
        data?.status === "PARTIAL" ||
        data?.status === "FAILED"
      ) {
        return;
      }
      void poll();
    }, 2500);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [analysisId, data?.status]);

  const reportLink = useMemo(() => {
    if (!data?.reportId) {
      return null;
    }

    return data.privateToken
      ? `/r/${data.reportId}?token=${encodeURIComponent(data.privateToken)}`
      : `/r/${data.reportId}`;
  }, [data?.privateToken, data?.reportId]);

  return (
    <div className="card stack">
      {!data && !error ? <div>Loading status...</div> : null}
      {data ? (
        <>
          <div className="row">
            <span>Status:</span>
            <span className="badge">{data.status}</span>
          </div>
          {data.status === "FAILED" ? (
            <div className="error">Analysis failed: {data.errorCode || "Unknown error"}</div>
          ) : null}

          {reportLink ? (
            <div className="stack">
              <Link className="button" href={reportLink}>
                Open report
              </Link>
              {data.privateToken ? (
                <div className="muted">Private token attached to this link.</div>
              ) : (
                <div className="muted">If token is missing, open report as owner and generate a share link.</div>
              )}
            </div>
          ) : null}
        </>
      ) : null}

      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}