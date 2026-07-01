"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { resolveAnalysisErrorDetails, resolveUserErrorMessage } from "@/lib/ui-error-messages";

interface AnalysisStatusResponse {
  analysisId: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "DONE_WITH_WARNINGS" | "FAILED" | "PARTIAL";
  pipelineStage:
    | "PREPARING_SOURCE"
    | "RUNNING_STATIC_SCANNER"
    | "EXTRACTING_CONTRACT_STRUCTURE"
    | "RUNNING_AI_AUDIT"
    | "GENERATING_REPORT"
    | null;
  reportId: string | null;
  errorCode: string | null;
  errorDetail: string | null;
  privateToken: string | null;
}

const ANALYSIS_PHASES = [
  "Preparing source",
  "Running static scanner",
  "Extracting contract structure",
  "Running AI audit",
  "Generating report"
] as const;

function isTerminalStatus(status: AnalysisStatusResponse["status"]): boolean {
  return status === "COMPLETED" || status === "DONE_WITH_WARNINGS" || status === "PARTIAL" || status === "FAILED";
}

function activePhaseIndex(params: {
  status: AnalysisStatusResponse["status"];
  pipelineStage: AnalysisStatusResponse["pipelineStage"];
  elapsedMs: number;
}): number {
  if (params.status === "QUEUED") {
    return 0;
  }

  if (params.status === "RUNNING") {
    if (params.pipelineStage) {
      const indexByStage: Record<Exclude<AnalysisStatusResponse["pipelineStage"], null>, number> = {
        PREPARING_SOURCE: 0,
        RUNNING_STATIC_SCANNER: 1,
        EXTRACTING_CONTRACT_STRUCTURE: 2,
        RUNNING_AI_AUDIT: 3,
        GENERATING_REPORT: 4
      };
      return indexByStage[params.pipelineStage];
    }

    const stepMs = 3500;
    return Math.min(ANALYSIS_PHASES.length - 1, Math.floor(params.elapsedMs / stepMs));
  }

  return ANALYSIS_PHASES.length - 1;
}

function failurePhaseIndex(params: {
  pipelineStage: AnalysisStatusResponse["pipelineStage"];
  errorCode: string | null;
}): number {
  if (params.pipelineStage) {
    const indexByStage: Record<Exclude<AnalysisStatusResponse["pipelineStage"], null>, number> = {
      PREPARING_SOURCE: 0,
      RUNNING_STATIC_SCANNER: 1,
      EXTRACTING_CONTRACT_STRUCTURE: 2,
      RUNNING_AI_AUDIT: 3,
      GENERATING_REPORT: 4
    };

    return indexByStage[params.pipelineStage];
  }

  const code = (params.errorCode || "").toUpperCase();

  if (
    code.includes("SOURCE_") ||
    code.startsWith("BASESCAN") ||
    code.startsWith("SOURCIFY") ||
    code === "INVALID_CHAIN" ||
    code === "INVALID_ADDRESS"
  ) {
    return 0;
  }

  if (code.includes("COMPILATION") || code.includes("SLITHER") || code.includes("SOLC")) {
    return 1;
  }

  if (code.includes("STRUCTURE")) {
    return 2;
  }

  if (code.includes("AI_AUDIT")) {
    return 3;
  }

  if (code.includes("REPORT") || code.includes("TIMEOUT")) {
    return 4;
  }

  return 1;
}

function statusTone(status: AnalysisStatusResponse["status"]): string {
  if (status === "FAILED") {
    return "critical";
  }

  if (status === "PARTIAL" || status === "DONE_WITH_WARNINGS") {
    return "warning";
  }

  if (status === "COMPLETED") {
    return "positive";
  }

  return "active";
}

export default function AnalysisStatusClient({ analysisId }: { analysisId: string }) {
  const [data, setData] = useState<AnalysisStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningStartedAt, setRunningStartedAt] = useState<number | null>(null);
  const [phaseTick, setPhaseTick] = useState<number>(Date.now());

  useEffect(() => {
    if (data?.status !== "RUNNING") {
      return;
    }

    if (!runningStartedAt) {
      setRunningStartedAt(Date.now());
    }
  }, [data?.status, runningStartedAt]);

  useEffect(() => {
    if (data?.status !== "QUEUED" && data?.status !== "RUNNING") {
      return;
    }

    const timer = setInterval(() => setPhaseTick(Date.now()), 700);
    return () => clearInterval(timer);
  }, [data?.status]);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const response = await fetch(`/api/v1/analysis/${analysisId}`, { cache: "no-store" });
        const payload = (await response.json()) as
          | AnalysisStatusResponse
          | { error?: { code?: string; message?: string } };

        if (!response.ok) {
          const err = (payload as { error?: { code?: string; message?: string } }).error;
          throw new Error(
            resolveUserErrorMessage({
              code: err?.code,
              fallbackMessage: err?.message,
              defaultMessage: "Unable to load analysis status"
            })
          );
        }

        if (!active) {
          return;
        }

        setError(null);
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
        data?.status && isTerminalStatus(data.status)
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
      ? `/report/${data.reportId}?token=${encodeURIComponent(data.privateToken)}`
      : `/report/${data.reportId}`;
  }, [data?.privateToken, data?.reportId]);

  const phaseState = useMemo(() => {
    if (!data) {
      return {
        activeIndex: 0,
        elapsedMs: 0
      };
    }

    const elapsedMs =
      data.status === "RUNNING" && runningStartedAt
        ? Math.max(0, phaseTick - runningStartedAt)
        : 0;

    return {
      activeIndex: activePhaseIndex({ status: data.status, pipelineStage: data.pipelineStage, elapsedMs }),
      elapsedMs
    };
  }, [data, phaseTick, runningStartedAt]);

  const analysisErrorDetails = useMemo(() => {
    if (!data || data.status !== "FAILED") {
      return null;
    }

    return resolveAnalysisErrorDetails(data.errorCode);
  }, [data]);

  const progressLabel = useMemo(() => {
    if (!data) {
      return "Preparing analysis status...";
    }

    if (data.status === "QUEUED") {
      return "Analysis queued. Preparing source for processing.";
    }

    if (data.status === "RUNNING") {
      return "Analysis is running. Phases are approximate and reflect active processing.";
    }

    if (data.status === "FAILED") {
      return "Analysis stopped before report generation completed.";
    }

    return "Analysis pipeline completed.";
  }, [data]);

  return (
    <div className="card stack status-card">
      {!data && !error ? <div>Loading status...</div> : null}
      {data ? (
        <>
          <div className={`status-hero tone-${statusTone(data.status)}`}>
            <div className="status-hero-copy stack">
              <div className="row status-hero-row">
                <span className="section-eyebrow">Current State</span>
                <span className="badge">{data.status}</span>
              </div>
              <h2>{progressLabel}</h2>
              <p className="muted">
                {data.pipelineStage
                  ? `Active stage: ${data.pipelineStage.replaceAll("_", " ").toLowerCase()}.`
                  : data.status === "PARTIAL"
                    ? "The report was generated, but at least one stage returned limited coverage or scoped completion."
                    : data.status === "FAILED"
                      ? "The pipeline stopped before a complete review memo could be generated."
                      : "The pipeline is preparing the next visible stage."}
              </p>
            </div>
          </div>

          <div className="stack memo-section">
            <div className="section-eyebrow">Pipeline Progress</div>
            <h3 style={{ margin: 0 }}>Progress</h3>
            <div className="stack progress-list progress-timeline">
              {ANALYSIS_PHASES.map((phase, index) => {
                const terminal = isTerminalStatus(data.status);
                const failedIndex =
                  data.status === "FAILED"
                    ? failurePhaseIndex({
                        pipelineStage: data.pipelineStage,
                        errorCode: data.errorCode
                      })
                    : null;
                const isDone =
                  data.status === "COMPLETED" ||
                  data.status === "DONE_WITH_WARNINGS" ||
                  data.status === "PARTIAL"
                    ? true
                    : data.status === "FAILED" && failedIndex !== null
                      ? index < failedIndex
                    : index < phaseState.activeIndex;
                const isActive =
                  data.status === "FAILED" && failedIndex !== null
                    ? index === failedIndex
                    : !terminal && (data.status === "QUEUED" || data.status === "RUNNING")
                    ? index === phaseState.activeIndex
                    : false;
                const isFailed = data.status === "FAILED" && isActive;

                return (
                  <div key={phase} className={`progress-phase ${isDone ? "done" : isActive ? "active" : "pending"}`}>
                    <div className="row progress-phase-head">
                      <span className="progress-state" aria-hidden="true">
                      {isDone
                        ? "done"
                        : isFailed
                          ? "failed"
                          : isActive
                            ? <span className="spinner" />
                            : "pending"}
                      </span>
                      <strong>{phase}</strong>
                    </div>
                    <p className="muted progress-phase-copy">
                      {isDone
                        ? "This stage finished successfully within the current pipeline run."
                        : isActive
                          ? "This stage is actively processing now."
                          : "This stage has not started yet in the current run."}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {analysisErrorDetails ? (
            <div className="card error stack memo-section">
              <strong>{analysisErrorDetails.title}</strong>
              <div>{analysisErrorDetails.message}</div>
              {analysisErrorDetails.hint ? <div className="muted">{analysisErrorDetails.hint}</div> : null}
              {data.errorDetail ? <div className="muted">details: {data.errorDetail}</div> : null}
              {analysisErrorDetails.code ? <div className="muted">code: {analysisErrorDetails.code}</div> : null}
            </div>
          ) : null}

          {reportLink ? (
            <div className="memo-section stack">
              <div className="section-eyebrow">Next Step</div>
              <div className="action-panel stack">
                <div>
                  <strong>Report ready for review.</strong>
                  <div className="muted">
                    {data.privateToken
                      ? "This link already includes the private token required for direct access."
                      : "If token access is needed later, open the report as owner and generate a private link from the report controls."}
                  </div>
                </div>
                <div className="action-group">
                  <Link className="button" href={reportLink} target="_blank" rel="noreferrer">
                    Open report
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}
