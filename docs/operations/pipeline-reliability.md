## Pipeline Reliability Notes

### Worker restart safety

- Analyses are persisted in `analysis_requests` with status and `pipelineStage`.
- If a worker restarts during an in-flight run, stale `RUNNING` analyses are recovered by the watchdog sweep.
- Recovery behavior is deterministic: stale in-flight analyses are finalized as `FAILED` with `errorCode=ANALYSIS_TIMEOUT` and `pipelineStage=null`.
- Sweep runs on worker boot and on a fixed interval controlled by:
  - `ANALYSIS_STALE_TIMEOUT_MS`
  - `ANALYSIS_STALE_SWEEP_INTERVAL_MS`

### Timeout model

- Source retrieval: provider-specific timeout handling (BaseScan budget + Sourcify timeout).
- Static scanner: `SCANNER_TIMEOUT_MS`.
- Structure extraction: `STRUCTURE_EXTRACTION_TIMEOUT_MS`.
- AI audit: `OPENAI_AUDIT_TIMEOUT_MS`.
- Report generation stage: `REPORT_GENERATION_TIMEOUT_MS`.
- Global guardrail: `ANALYSIS_TOTAL_TIMEOUT_MS`.
