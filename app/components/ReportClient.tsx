"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";

import WalletButton from "@/app/components/WalletButton";
import { describeAnalysisNote } from "@/lib/partial-reasons";
import { receiptRegistryAbi } from "@/lib/receipt-shared";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";

interface ReportFinding {
  id: string;
  title: string;
  severity: Severity;
  evidence: Array<{ filePath: string; line?: number; excerpt: string }>;
  whyItMatters: string;
  fixDirection: string;
  confidence: number;
  needsManualCheck: boolean;
}

interface ReportApiResponse {
  reportId: string;
  visibility: "PRIVATE" | "PUBLIC";
  reportHash: string;
  topSeverity: Severity;
  isOwner: boolean;
  report: {
    executiveSummary: string;
    findings: ReportFinding[];
    metadata: {
      inputType: string;
      chainId: number;
      contractAddress?: string;
      generatedAt: string;
    };
    warnings: string[];
    scannerErrors: string[];
    partialReasons: string[];
  };
  receipt: {
    txHash: string;
    chainId: number;
    receiptId: string;
    mintedAt: string;
    contractAddress: string;
    mintedBy: string;
    receiptOwner: string;
    receiptMinter: string;
  } | null;
}

interface PreparedReceiptResponse {
  existing?: boolean;
  receipt?: ReportApiResponse["receipt"];
  typedData?: {
    domain: {
      name: string;
      version: string;
      chainId: number;
      verifyingContract: Address;
    };
    primaryType: "MintAuthorization";
    types: {
      EIP712Domain: Array<{ name: string; type: string }>;
      MintAuthorization: Array<{ name: string; type: string }>;
    };
    message: {
      reportHash: Hex;
      contractAddress: Address;
      analyzerVersionHash: Hex;
      owner: Address;
      nonce: string;
      deadline: string;
    };
  };
  call?: {
    to: Address;
    chainId: number;
    functionName: "mintWithSig";
    args: {
      reportHash: Hex;
      contractAddress: Address;
      analyzerVersionHash: Hex;
      owner: Address;
      nonce: string;
      deadline: string;
    };
  };
  error?: { message?: string };
}

export default function ReportClient({ reportId, token }: { reportId: string; token: string | null }) {
  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [severityFilter, setSeverityFilter] = useState<"ALL" | Severity>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [mintPayload, setMintPayload] = useState<{
    to: Address;
    data: Hex;
    chainId: number;
    owner: Address;
    nonce: string;
    deadline: string;
  } | null>(null);

  async function loadReport() {
    setError(null);
    const response = await fetch(
      `/api/v1/report/${reportId}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
      {
        cache: "no-store"
      }
    );

    const json = (await response.json()) as ReportApiResponse | { error?: { message?: string } };
    if (!response.ok) {
      throw new Error((json as { error?: { message?: string } }).error?.message || "Failed to load report");
    }

    setData(json as ReportApiResponse);
  }

  useEffect(() => {
    void loadReport().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, token]);

  const findings = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.report.findings.filter((finding) =>
      severityFilter === "ALL" ? true : finding.severity === severityFilter
    );
  }, [data, severityFilter]);

  async function updateVisibility(visibility: "PRIVATE" | "PUBLIC") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/report/${reportId}/visibility`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ visibility })
      });
      const json = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(json.error?.message || "Visibility update failed");
      }
      await loadReport();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  }

  async function createShareLink() {
    setBusy(true);
    setError(null);
    setShareLink(null);

    try {
      const response = await fetch(`/api/v1/report/${reportId}/share-token`, {
        method: "POST"
      });

      const json = (await response.json()) as {
        url?: string;
        error?: { message?: string };
      };

      if (!response.ok || !json.url) {
        throw new Error(json.error?.message || "Could not create private link");
      }

      setShareLink(json.url);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  }

  async function fetchPreparedMint(): Promise<PreparedReceiptResponse> {
    const prepResp = await fetch(`/api/v1/receipt/${reportId}/prepare`, { method: "POST" });
    const prepJson = (await prepResp.json()) as PreparedReceiptResponse;

    if (!prepResp.ok) {
      throw new Error(prepJson.error?.message || "Could not prepare receipt mint");
    }

    return prepJson;
  }

  async function ensureWalletChain(chainId: number) {
    if (!window.ethereum) {
      throw new Error("No injected wallet found. Use returned payload to mint manually.");
    }

    const current = (await window.ethereum.request({ method: "eth_chainId" })) as string;
    const currentChain = Number.parseInt(current, 16);
    if (currentChain === chainId) {
      return;
    }

    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${chainId.toString(16)}` }]
    });
  }

  async function mintReceipt() {
    setBusy(true);
    setError(null);

    try {
      let prepared = await fetchPreparedMint();

      if (prepared.existing) {
        await loadReport();
        return;
      }

      if (!prepared.call || !prepared.typedData) {
        throw new Error("Prepare response missing typedData/call payload");
      }

      if (!window.ethereum) {
        throw new Error("No injected wallet found. Use returned payload to mint manually.");
      }

      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts?.[0] as Address | undefined;
      if (!from) {
        throw new Error("No wallet account available");
      }

      if (from.toLowerCase() !== prepared.call.args.owner.toLowerCase()) {
        throw new Error("Connected wallet does not match prepared owner");
      }

      if (BigInt(prepared.call.args.deadline) <= BigInt(Math.floor(Date.now() / 1000))) {
        prepared = await fetchPreparedMint();
        if (prepared.existing) {
          await loadReport();
          return;
        }
        if (!prepared.call || !prepared.typedData) {
          throw new Error("Fresh prepare response missing typedData/call payload");
        }
      }

      await ensureWalletChain(prepared.call.chainId);

      const signature = (await window.ethereum.request({
        method: "eth_signTypedData_v4",
        params: [from, JSON.stringify(prepared.typedData)]
      })) as Hex;

      const data = encodeFunctionData({
        abi: receiptRegistryAbi,
        functionName: "mintWithSig",
        args: [
          prepared.call.args.reportHash,
          prepared.call.args.contractAddress,
          prepared.call.args.analyzerVersionHash,
          prepared.call.args.owner,
          BigInt(prepared.call.args.nonce),
          BigInt(prepared.call.args.deadline),
          signature
        ]
      });

      setMintPayload({
        to: prepared.call.to,
        data,
        chainId: prepared.call.chainId,
        owner: prepared.call.args.owner,
        nonce: prepared.call.args.nonce,
        deadline: prepared.call.args.deadline
      });

      const txHash = (await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from,
            to: prepared.call.to,
            data
          }
        ]
      })) as string;

      const confirmResp = await fetch(`/api/v1/receipt/${reportId}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          txHash,
          owner: prepared.call.args.owner,
          nonce: prepared.call.args.nonce,
          deadline: prepared.call.args.deadline,
          signature
        })
      });

      const confirmJson = (await confirmResp.json()) as {
        error?: { message?: string };
      };

      if (!confirmResp.ok) {
        throw new Error(confirmJson.error?.message || "Receipt confirmation failed");
      }

      await loadReport();
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : String(actionError);

      if (message.toLowerCase().includes("expired")) {
        try {
          const refreshed = await fetchPreparedMint();
          if (!refreshed.existing && refreshed.call && refreshed.typedData) {
            setMintPayload({
              to: refreshed.call.to,
              data: "0x",
              chainId: refreshed.call.chainId,
              owner: refreshed.call.args.owner,
              nonce: refreshed.call.args.nonce,
              deadline: refreshed.call.args.deadline
            });
            setError("Authorization expired. Fresh typed data prepared, please mint again.");
            return;
          }
        } catch {
          // Keep original error.
        }
      }

      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (!data && !error) {
    return <div className="card">Loading report...</div>;
  }

  return (
    <div className="stack">
      {data ? (
        <>
          <div className="card stack">
            <div className="row">
              <h1 style={{ margin: 0 }}>Security Report</h1>
              <span className={`badge ${data.topSeverity}`}>{data.topSeverity}</span>
              <span className="badge">{data.visibility}</span>
            </div>

            <div className="muted">reportId: {data.reportId}</div>
            <div className="muted">reportHash: {data.reportHash}</div>
            <p>{data.report.executiveSummary}</p>

            <div className="row">
              <label>
                Severity filter:
                <select
                  className="select"
                  value={severityFilter}
                  onChange={(event) => setSeverityFilter(event.target.value as "ALL" | Severity)}
                >
                  <option value="ALL">ALL</option>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                  <option value="INFO">INFO</option>
                </select>
              </label>
            </div>

            {data.isOwner ? (
              <div className="stack">
                <hr className="divider" />
                <WalletButton onSessionChange={loadReport} />
                <div className="row">
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy || data.visibility === "PUBLIC"}
                    onClick={() => updateVisibility("PUBLIC")}
                  >
                    Publish report
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy || data.visibility === "PRIVATE"}
                    onClick={() => updateVisibility("PRIVATE")}
                  >
                    Make private
                  </button>
                  <button className="button" type="button" disabled={busy} onClick={createShareLink}>
                    Generate private link
                  </button>
                  <button className="button warn" type="button" disabled={busy} onClick={mintReceipt}>
                    Mint Base receipt
                  </button>
                </div>

                {shareLink ? (
                  <div className="stack">
                    <div className="muted">Private link:</div>
                    <pre>{shareLink}</pre>
                  </div>
                ) : null}

                {mintPayload ? (
                  <div className="stack">
                    <div className="muted">Prepared transaction payload:</div>
                    <pre>{JSON.stringify(mintPayload, null, 2)}</pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {data.receipt ? (
            <div className="card stack">
              <h2 style={{ margin: 0 }}>Onchain Receipt</h2>
              <div>txHash: {data.receipt.txHash}</div>
              <div>receiptId: {data.receipt.receiptId}</div>
              <div>owner: {data.receipt.receiptOwner}</div>
              <div>minter: {data.receipt.receiptMinter}</div>
              <Link href={`/receipt/${data.reportId}${token ? `?token=${encodeURIComponent(token)}` : ""}`}>
                Open receipt details
              </Link>
            </div>
          ) : null}

          <div className="card stack">
            <h2 style={{ margin: 0 }}>Findings ({findings.length})</h2>
            {findings.length === 0 ? <div>No findings for selected filter.</div> : null}

            {findings.map((finding) => (
              <details key={finding.id} className="card">
                <summary className="row" style={{ cursor: "pointer" }}>
                  <span className={`badge ${finding.severity}`}>{finding.severity}</span>
                  <strong>{finding.title}</strong>
                  <span className="muted">confidence: {finding.confidence}%</span>
                  {finding.needsManualCheck ? <span className="badge">needs manual check</span> : null}
                </summary>

                <div className="stack" style={{ marginTop: 10 }}>
                  <div>
                    <strong>Why it matters:</strong> {finding.whyItMatters}
                  </div>
                  <div>
                    <strong>Fix direction:</strong> {finding.fixDirection}
                  </div>

                  <div className="stack">
                    <strong>Evidence:</strong>
                    {finding.evidence.map((evidence, idx) => (
                      <pre key={`${finding.id}-${idx}`}>
{`${evidence.filePath}${evidence.line ? `:${evidence.line}` : ""}\n${evidence.excerpt}`}
                      </pre>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>

          {data.report.warnings.length > 0 || data.report.scannerErrors.length > 0 || data.report.partialReasons.length > 0 ? (
            <div className="card stack">
              <h3 style={{ margin: 0 }}>Analysis Notes</h3>
              {data.report.warnings.map((item, idx) => (
                <div key={`warn-${idx}`} className="muted">
                  warning: {describeAnalysisNote(item)}
                </div>
              ))}
              {data.report.scannerErrors.map((item, idx) => (
                <div key={`err-${idx}`} className="muted">
                  scannerError: {item}
                </div>
              ))}
              {data.report.partialReasons.map((item, idx) => (
                <div key={`reason-${idx}`} className="muted">
                  note: {describeAnalysisNote(item)}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {error ? <div className="card error">{error}</div> : null}
    </div>
  );
}
