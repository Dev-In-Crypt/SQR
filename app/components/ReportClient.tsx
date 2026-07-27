"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { encodeFunctionData, type Address, type Hex } from "viem";

import { providerErrorCode } from "@/lib/eip1193";
import { receiptRegistryAbi } from "@/lib/receipt-shared";
import { resolveUserErrorMessage } from "@/lib/ui-error-messages";
import { EnsureChainError, ensureChain, readWalletChainHex } from "@/lib/wallet-chain";

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
    scannerSummary?: string;
    findings: ReportFinding[];
    aiAuditFindings?: Array<{
      severity: Severity;
      title: string;
      location: string;
      explanation: string;
      evidence: string;
      fixDirection: string;
      source: "ai";
    }>;
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
  analysis?: {
    inputType: string;
    chainId: number;
    mode?: "FULL" | "QUICK_SCAN";
  };
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
  network?: {
    chainId: number;
    chainHex: `0x${string}`;
    label: string;
    addEthereumChain: {
      chainId: `0x${string}`;
      chainName: string;
      nativeCurrency: { name: string; symbol: string; decimals: number };
      rpcUrls: string[];
      blockExplorerUrls: string[];
    };
  };
  error?: { code?: string; message?: string };
}

interface RuntimeConfigResponse {
  receipt: {
    requiredChainId: number;
    requiredChainHex: `0x${string}`;
    requiredNetworkName: string;
    requiredNetworkLabel: string;
    addEthereumChain: {
      chainId: `0x${string}`;
      chainName: string;
      nativeCurrency: {
        name: "Ether";
        symbol: "ETH";
        decimals: 18;
      };
      rpcUrls: string[];
      blockExplorerUrls: string[];
    };
  };
}

interface ConfirmPayload {
  txHash: string;
  owner: Address;
  nonce: string;
  deadline: string;
  signature: Hex;
}

const SCANNER_SUMMARY_NOTES = [
  "No issues were identified within the automated analysis scope for this input. Independent review may add further validation.",
  "The automated review did not surface issues for the provided source and configured analysis scope."
] as const;

const DEFAULT_SCANNER_SUMMARY_NOTE_INDEX = 0;

interface ScannerSummaryViewModel {
  intro: string;
  keyRisks: string[];
  recommendations: string[];
  closing: string;
  paragraphs: string[];
}

function cleanSummaryText(value: string): string {
  let text = normalizeSummaryText(value)
    .replace(/\*\*/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  for (let i = 0; i < 4; i += 1) {
    const stripped = text.replace(/^(?:scanner summary|executive summary|summary)\s*:\s*/i, "").trim();
    if (stripped === text) {
      break;
    }
    text = stripped;
  }

  return text;
}

function splitSentences(value: string): string[] {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return [];
  }

  const matches = cleaned.match(/[^.!?]+[.!?]?/g);
  return (matches || []).map((part) => part.trim()).filter(Boolean);
}

function parseListItems(value: string): string[] {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact) {
    return [];
  }

  const numbered = compact.match(/\d+\.\s+[\s\S]*?(?=(?:\s+\d+\.\s+)|$)/g);
  if (numbered && numbered.length > 0) {
    return numbered
      .map((item) => item.replace(/^\d+\.\s+/, "").trim())
      .filter(Boolean);
  }

  const bulleted = compact.match(/(?:-|\*)\s+[\s\S]*?(?=(?:\s+(?:-|\*)\s+)|$)/g);
  if (bulleted && bulleted.length > 0) {
    return bulleted
      .map((item) => item.replace(/^(?:-|\*)\s+/, "").trim())
      .filter(Boolean);
  }

  return [];
}

function compactSentence(value: string, maxLength = 180): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }

  const firstSentence = splitSentences(cleaned)[0] || cleaned;
  if (firstSentence.length <= maxLength) {
    return firstSentence;
  }

  return `${firstSentence.slice(0, maxLength - 3).trimEnd()}...`;
}

function compactRisk(value: string): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return "";
  }

  const titled = cleaned.match(/^(.+?\([A-Z]+\s+severity\))/i);
  if (titled?.[1]) {
    return titled[1].trim();
  }

  return compactSentence(cleaned, 170);
}

function dedupeItems(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(normalized);
  }

  return output;
}

function inferRecommendations(text: string): string[] {
  const actionStart =
    /^(review|confirm|audit|restrict|validate|apply|use|avoid|consider|ensure|implement|add|verify)\b/i;

  return dedupeItems(
    splitSentences(text)
      .filter((sentence) => actionStart.test(sentence))
      .map((sentence) => compactSentence(sentence, 170))
  );
}

function toParagraphs(value: string): string[] {
  const sentences = splitSentences(value);
  if (sentences.length === 0) {
    return value.trim() ? [value.trim()] : [];
  }

  const paragraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(" "));
  }

  return paragraphs.slice(0, 4);
}

function formatScannerSummary(value: string): ScannerSummaryViewModel {
  const text = cleanSummaryText(value);
  if (!text) {
    return {
      intro: "",
      keyRisks: [],
      recommendations: [],
      closing: "",
      paragraphs: []
    };
  }

  const overallMatch = text.match(/\bOverall\s*:\s*([\s\S]*)$/i);
  const closing = overallMatch?.[1] ? compactSentence(overallMatch[1], 240) : "";
  const textBeforeOverall = overallMatch ? text.slice(0, overallMatch.index).trim() : text;

  const recommendationMatch = textBeforeOverall.match(/\bRecommendations?\s*:\s*([\s\S]*)$/i);
  const recommendationSection = recommendationMatch?.[1]?.trim() || "";
  const textBeforeRecommendations = recommendationMatch
    ? textBeforeOverall.slice(0, recommendationMatch.index).trim()
    : textBeforeOverall;

  const firstNumbered = textBeforeRecommendations.match(/(?:^|\s)\d+\.\s+/);
  const firstNumberedIndex = firstNumbered
    ? firstNumbered.index ?? textBeforeRecommendations.indexOf(firstNumbered[0])
    : -1;

  const intro = compactSentence(
    firstNumberedIndex >= 0
      ? textBeforeRecommendations.slice(0, firstNumberedIndex).trim()
      : textBeforeRecommendations,
    240
  );

  const riskSection = firstNumberedIndex >= 0 ? textBeforeRecommendations.slice(firstNumberedIndex).trim() : "";

  const keyRisks = dedupeItems(parseListItems(riskSection).map((item) => compactRisk(item))).slice(0, 4);
  const recommendations = dedupeItems(
    [
      ...parseListItems(recommendationSection).map((item) => compactSentence(item, 170)),
      ...inferRecommendations(text)
    ].filter(Boolean)
  ).slice(0, 5);

  const shouldUseParagraphFallback = keyRisks.length === 0 && recommendations.length === 0;

  return {
    intro,
    keyRisks,
    recommendations,
    closing,
    paragraphs: shouldUseParagraphFallback ? toParagraphs(text) : []
  };
}

function displayInputType(metadataInputType: string, contractAddress?: string): string {
  if (metadataInputType === "PASTE_CODE") {
    return "Snippet";
  }

  if (metadataInputType === "BASE_ADDRESS") {
    return contractAddress ? "Contract address" : "Contract address";
  }

  return metadataInputType;
}

const CHAIN_LABELS: Record<number, string> = {
  8453: "Base",
  84532: "Base Sepolia",
  42161: "Arbitrum One",
  421614: "Arbitrum Sepolia"
};

function displayChain(chainId: number): string {
  return `${CHAIN_LABELS[chainId] ?? "Chain"} (${chainId})`;
}

function shortenHash(value: string): string {
  if (value.length <= 16) {
    return value;
  }

  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString();
}

function statusSummary(data: ReportApiResponse): string {
  if (data.report.partialReasons.length > 0 || data.report.scannerErrors.length > 0) {
    return "The report is usable, but some stages completed with limited coverage or operational constraints.";
  }

  if (data.report.findings.length === 0 && (data.report.aiAuditFindings?.length ?? 0) === 0) {
    return "The automated review did not identify findings within the current scope. Independent validation may still reveal issues outside that scope.";
  }

  return "The memo below combines structured findings, AI-assisted review notes, and provenance controls for follow-up review.";
}

function severityRank(severity: Severity): number {
  switch (severity) {
    case "CRITICAL":
      return 0;
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 3;
    case "INFO":
      return 4;
  }
}

function severityGroupLabel(severity: Severity): "Critical & High" | "Medium" | "Low & Info" {
  if (severity === "CRITICAL" || severity === "HIGH") {
    return "Critical & High";
  }

  if (severity === "MEDIUM") {
    return "Medium";
  }

  return "Low & Info";
}

function normalizeSummaryText(value: string): string {
  return value
    .replace(/secure for deployment/gi, "did not identify findings within the current automated review scope")
    .replace(/safe for deployment/gi, "did not identify findings within the current automated review scope")
    .replace(/no security vulnerabilities/gi, "no findings were identified within the current automated review scope")
    .replace(/adheres to best practices/gi, "matches patterns reviewed in the current automated scope");
}

export default function ReportClient({ reportId, token }: { reportId: string; token: string | null }) {
  const [data, setData] = useState<ReportApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [, setWalletChainHex] = useState<string | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfigResponse["receipt"] | null>(null);
  const [mintPayload, setMintPayload] = useState<{
    to: Address;
    data: Hex;
    chainId: number;
    owner: Address;
    nonce: string;
    deadline: string;
  } | null>(null);
  const [copiedHash, setCopiedHash] = useState(false);

  function isLikelyInvalidNonceError(error: unknown): boolean {
    const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
    return message.includes("invalidnonce") || message.includes("invalid nonce");
  }

  async function waitForWalletReceipt(txHash: string, timeoutMs = 120_000): Promise<void> {
    if (!window.ethereum) {
      return;
    }

    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const receipt = (await window.ethereum.request({
        method: "eth_getTransactionReceipt",
        params: [txHash]
      })) as { status?: string } | null;

      if (receipt) {
        if (receipt.status === "0x0") {
          throw new Error("Mint transaction reverted onchain. Please refresh mint authorization and retry.");
        }

        return;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 1500);
      });
    }

    throw new Error("Mint transaction is still pending. Please wait, then retry confirmation.");
  }

  async function confirmMintWithRetry(payload: ConfirmPayload): Promise<void> {
    const maxAttempts = 8;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const confirmResp = await fetch(`/api/v1/receipt/${reportId}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const confirmJson = (await confirmResp.json()) as {
        error?: { code?: string; message?: string };
      };

      if (confirmResp.ok) {
        return;
      }

      const code = confirmJson.error?.code;
      const canRetry = code === "TX_NOT_FOUND_REQUIRED_NETWORK" || code === "MINT_EVENT_NOT_FOUND";
      if (canRetry && attempt < maxAttempts) {
        await new Promise((resolve) => {
          setTimeout(resolve, 1500);
        });
        continue;
      }

      throw new Error(
        resolveUserErrorMessage({
          code,
          fallbackMessage: confirmJson.error?.message,
          defaultMessage: "Receipt confirmation failed"
        })
      );
    }
  }

  async function signAndSendPreparedMint(params: {
    prepared: PreparedReceiptResponse;
    from: Address;
    ensureRequiredChain: () => Promise<void>;
    provider: NonNullable<typeof window.ethereum>;
  }): Promise<ConfirmPayload> {
    const { prepared, from, ensureRequiredChain, provider } = params;

    await ensureRequiredChain();

    const signature = (await provider.request({
      method: "eth_signTypedData_v4",
      params: [from, JSON.stringify(prepared.typedData)]
    })) as Hex;

    const data = encodeFunctionData({
      abi: receiptRegistryAbi,
      functionName: "mintWithSig",
      args: [
        prepared.call!.args.reportHash,
        prepared.call!.args.contractAddress,
        prepared.call!.args.analyzerVersionHash,
        prepared.call!.args.owner,
        BigInt(prepared.call!.args.nonce),
        BigInt(prepared.call!.args.deadline),
        signature
      ]
    });

    setMintPayload({
      to: prepared.call!.to,
      data,
      chainId: prepared.call!.chainId,
      owner: prepared.call!.args.owner,
      nonce: prepared.call!.args.nonce,
      deadline: prepared.call!.args.deadline
    });

    await ensureRequiredChain();

    const txHash = (await provider.request({
      method: "eth_sendTransaction",
      params: [
        {
          from,
          to: prepared.call!.to,
          data
        }
      ]
    })) as string;

    return {
      txHash,
      owner: prepared.call!.args.owner,
      nonce: prepared.call!.args.nonce,
      deadline: prepared.call!.args.deadline,
      signature
    };
  }

  async function loadReport() {
    setError(null);
    const response = await fetch(
      `/api/v1/report/${reportId}${token ? `?token=${encodeURIComponent(token)}` : ""}`,
      {
        cache: "no-store"
      }
    );

    const json = (await response.json()) as ReportApiResponse | { error?: { code?: string; message?: string } };
    if (!response.ok) {
      const err = (json as { error?: { code?: string; message?: string } }).error;
      throw new Error(
        resolveUserErrorMessage({
          code: err?.code,
          fallbackMessage: err?.message,
          defaultMessage: "Failed to load report"
        })
      );
    }

    setData(json as ReportApiResponse);
  }

  async function fetchRuntimeConfig(): Promise<RuntimeConfigResponse["receipt"]> {
    const response = await fetch("/api/v1/config", {
      cache: "no-store"
    });

    const json = (await response.json()) as RuntimeConfigResponse | { error?: { code?: string; message?: string } };
    if (!response.ok) {
      const err = (json as { error?: { code?: string; message?: string } }).error;
      throw new Error(
        resolveUserErrorMessage({
          code: err?.code,
          fallbackMessage: err?.message,
          defaultMessage: "Failed to load runtime config"
        })
      );
    }

    const receiptConfig = (json as RuntimeConfigResponse).receipt;
    setRuntimeConfig(receiptConfig);
    return receiptConfig;
  }

  useEffect(() => {
    void loadReport().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, token]);

  useEffect(() => {
    void fetchRuntimeConfig().catch(() => {
      // Runtime config errors are surfaced when mint action starts.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!window.ethereum) {
      setWalletChainHex(null);
      return;
    }

    let mounted = true;

    const syncWalletChain = async () => {
      if (!window.ethereum || !mounted) {
        return;
      }

      try {
        const chainHex = await readWalletChainHex(window.ethereum);
        if (mounted) {
          setWalletChainHex(chainHex);
        }
      } catch {
        if (mounted) {
          setWalletChainHex(null);
        }
      }
    };

    const onChainChanged = (nextChainId: unknown) => {
      if (typeof nextChainId === "string") {
        setWalletChainHex(nextChainId.toLowerCase());
        return;
      }

      void syncWalletChain();
    };

    void syncWalletChain();
    window.ethereum.on?.("chainChanged", onChainChanged);

    return () => {
      mounted = false;
      window.ethereum?.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  const findings = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.report.findings;
  }, [data]);

  const groupedFindings = useMemo(() => {
    const groups: Array<{
      title: "Critical & High" | "Medium" | "Low & Info";
      items: ReportFinding[];
    }> = [
      { title: "Critical & High", items: [] },
      { title: "Medium", items: [] },
      { title: "Low & Info", items: [] }
    ];

    const sorted = [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

    for (const finding of sorted) {
      const bucket = groups.find((group) => group.title === severityGroupLabel(finding.severity));
      bucket?.items.push(finding);
    }

    return groups.filter((group) => group.items.length > 0);
  }, [findings]);

  const coverage = useMemo(() => {
    if (!data) {
      return null;
    }

    const hasStaticNotes = data.report.scannerErrors.length > 0 || data.report.partialReasons.length > 0;

    return {
      staticAnalysis: hasStaticNotes ? "Completed" : "Completed",
      aiLogicReview: "Included",
      inputType: displayInputType(data.report.metadata.inputType, data.report.metadata.contractAddress),
      reportHashMode: "Available"
    };
  }, [data]);

  const summaryView = useMemo(() => {
    if (!data) {
      return {
        intro: "",
        keyRisks: [],
        recommendations: [],
        closing: "",
        paragraphs: []
      } as ScannerSummaryViewModel;
    }

    return formatScannerSummary(data.report.scannerSummary || data.report.executiveSummary);
  }, [data]);

  async function copyHash() {
    if (!data?.reportHash) {
      return;
    }

    try {
      await navigator.clipboard.writeText(data.reportHash);
      setCopiedHash(true);
      setTimeout(() => setCopiedHash(false), 1200);
    } catch {
      setCopiedHash(false);
    }
  }

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
      throw new Error(
        resolveUserErrorMessage({
          code: (prepJson as { error?: { code?: string } }).error?.code,
          fallbackMessage: prepJson.error?.message,
          defaultMessage: "Could not prepare receipt mint"
        })
      );
    }

    return prepJson;
  }

  // The receipt anchors on the report's own analysis chain, delivered in the
  // prepare response. Validate the payload is internally consistent about it.
  function ensurePreparedChainConsistent(prepared: PreparedReceiptResponse) {
    if (!prepared.call || !prepared.typedData || !prepared.network) {
      throw new Error("Prepare response missing typedData/call/network payload");
    }

    const target = prepared.network.chainId;
    if (prepared.call.chainId !== target || prepared.typedData.domain.chainId !== target) {
      throw new Error(
        `Prepared mint chain mismatch: network ${target}, call ${prepared.call.chainId}, typedData ${prepared.typedData.domain.chainId}`
      );
    }
  }

  async function mintReceipt() {
    setBusy(true);
    setError(null);

    try {
      if (!window.ethereum) {
        throw new Error("No injected wallet found. Use returned payload to mint manually.");
      }

      const provider = window.ethereum;
      // Keeps the fallback network label populated; the actual mint chain comes
      // from the prepare response (the report's own analysis chain).
      await fetchRuntimeConfig().catch(() => null);

      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts?.[0] as Address | undefined;
      if (!from) {
        throw new Error("No wallet account available");
      }

      let prepared = await fetchPreparedMint();

      if (prepared.existing) {
        await loadReport();
        return;
      }

      ensurePreparedChainConsistent(prepared);

      const targetNetwork = prepared.network!;
      const ensureRequiredChain = async () => {
        const ensured = await ensureChain({
          provider,
          requiredChainId: targetNetwork.chainId,
          requiredNetworkLabel: targetNetwork.label,
          addEthereumChain: targetNetwork.addEthereumChain
        });

        setWalletChainHex(ensured.chainHex);
      };

      await ensureRequiredChain();

      if (from.toLowerCase() !== prepared.call!.args.owner.toLowerCase()) {
        throw new Error("Connected wallet does not match prepared owner");
      }

      if (BigInt(prepared.call!.args.deadline) <= BigInt(Math.floor(Date.now() / 1000))) {
        prepared = await fetchPreparedMint();
        if (prepared.existing) {
          await loadReport();
          return;
        }

        ensurePreparedChainConsistent(prepared);
      }

      let signedMint: ConfirmPayload;
      try {
        signedMint = await signAndSendPreparedMint({
          prepared,
          from,
          ensureRequiredChain,
          provider
        });
      } catch (sendError) {
        if (!isLikelyInvalidNonceError(sendError)) {
          throw sendError;
        }

        const refreshed = await fetchPreparedMint();
        if (refreshed.existing) {
          await loadReport();
          return;
        }

        ensurePreparedChainConsistent(refreshed);
        if (from.toLowerCase() !== refreshed.call!.args.owner.toLowerCase()) {
          throw new Error("Connected wallet does not match prepared owner");
        }

        signedMint = await signAndSendPreparedMint({
          prepared: refreshed,
          from,
          ensureRequiredChain,
          provider
        });
      }

      await waitForWalletReceipt(signedMint.txHash);

      try {
        await confirmMintWithRetry(signedMint);
      } catch (confirmError) {
        if (!isLikelyInvalidNonceError(confirmError)) {
          throw confirmError;
        }

        const refreshed = await fetchPreparedMint();
        if (refreshed.existing) {
          await loadReport();
          return;
        }

        ensurePreparedChainConsistent(refreshed);
        if (from.toLowerCase() !== refreshed.call!.args.owner.toLowerCase()) {
          throw new Error("Connected wallet does not match prepared owner");
        }

        signedMint = await signAndSendPreparedMint({
          prepared: refreshed,
          from,
          ensureRequiredChain,
          provider
        });

        await waitForWalletReceipt(signedMint.txHash);
        await confirmMintWithRetry(signedMint);
      }

      await loadReport();
    } catch (actionError) {
      if (actionError instanceof EnsureChainError) {
        setError(actionError.message);
        return;
      }

      const providerCode = providerErrorCode(actionError);
      if (providerCode === 4001) {
        const networkLabel = runtimeConfig?.requiredNetworkLabel || "the required Base network";
        setError(`Mint requires ${networkLabel}. Wallet request was rejected.`);
        return;
      }

      const message = actionError instanceof Error ? actionError.message : String(actionError);

      if (isLikelyInvalidNonceError(actionError)) {
        setError("Nonce mismatch detected. Mint payload was refreshed; please retry once.");
        return;
      }

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
          <div className="card stack memo-surface report-cover">
            <div className="row report-cover-row">
              <div className="stack report-cover-copy">
                <div className="section-eyebrow">Security Review Memo</div>
                <h1 style={{ margin: 0 }}>Security Report</h1>
                <p className="muted page-intro">{statusSummary(data)}</p>
              </div>
              <div className="row report-cover-badges">
                <span className={`badge ${data.topSeverity}`}>{data.topSeverity}</span>
                <span className="badge">{data.visibility}</span>
                {data.analysis?.mode === "QUICK_SCAN" ? <span className="badge">Quick scan</span> : null}
                {data.isOwner ? <span className="badge">Owner view</span> : <span className="badge">Viewer access</span>}
              </div>
            </div>

            {data.analysis?.mode === "QUICK_SCAN" ? (
              <div className="note-panel stack" role="note">
                <strong>Static checks only.</strong>
                <span className="muted">
                  This quick scan skipped the AI-assisted logic review and does not produce an
                  onchain receipt. Run a full analysis for AI findings, a deterministic report
                  hash, and an optional Base receipt.
                </span>
                <div className="row">
                  <Link className="button" href="/">
                    Run full AI-assisted review →
                  </Link>
                </div>
              </div>
            ) : null}

            <div className="metadata-grid report-meta-grid">
              <div className="metadata-item stack">
                <span className="meta-label">Generated</span>
                <div className="meta-value">{formatDateTime(data.report.metadata.generatedAt)}</div>
              </div>
              <div className="metadata-item stack">
                <span className="meta-label">Input type</span>
                <div className="meta-value">{displayInputType(data.report.metadata.inputType, data.report.metadata.contractAddress)}</div>
              </div>
              <div className="metadata-item stack">
                <span className="meta-label">Chain</span>
                <div className="meta-value">{displayChain(data.report.metadata.chainId)}</div>
              </div>
              <div className="metadata-item stack">
                <span className="meta-label">Report hash</span>
                <div className="meta-value mono-wrap">{shortenHash(data.reportHash)}</div>
              </div>
              <div className="metadata-item stack">
                <span className="meta-label">Report record</span>
                <div className="meta-value mono-wrap">{data.reportId}</div>
              </div>
            </div>

            <div className="action-group no-print">
              <span className="muted">Report hash: {shortenHash(data.reportHash)}</span>
              <button className="button ghost" type="button" onClick={copyHash}>
                {copiedHash ? "Copied" : "Copy hash"}
              </button>
              <a
                className="button ghost"
                href={`/api/v1/report/${reportId}/export?format=md${token ? `&token=${encodeURIComponent(token)}` : ""}`}
              >
                Download Markdown
              </a>
              <button className="button ghost" type="button" onClick={() => window.print()}>
                Print / Save as PDF
              </button>
                {data.receipt ? (
                  <Link className="button secondary" href={`/receipt/${data.reportId}${token ? `?token=${encodeURIComponent(token)}` : ""}`}>
                    View receipt
                  </Link>
                ) : null}
            </div>

            {!data.isOwner ? (
              <div className="note-panel stack viewer-note">
                <span className="meta-label">Access context</span>
                <p className="muted">
                  You are viewing this report through shared or published access. Administrative controls remain available
                  only to the report owner.
                </p>
              </div>
            ) : null}
          </div>

          {data.report.partialReasons.length > 0 || data.report.scannerErrors.length > 0 ? (
            <div className="card stack memo-section note-panel caution-panel partial-banner">
              <div className="section-eyebrow">Coverage Notice</div>
              <h2 style={{ margin: 0 }}>This report completed with limited coverage.</h2>
              <p className="muted">
                Findings and summary are still usable, but at least one analysis stage returned partial coverage or an
                operational constraint. Review the transparency section before treating the memo as complete.
              </p>
            </div>
          ) : null}

          <div className="card stack memo-section report-overview">
            <div className="section-eyebrow">Overview</div>
            <div className="overview-grid">
              <div className="overview-item stack">
                <span className="meta-label">Structured findings</span>
                <strong className="overview-value">{findings.length}</strong>
              </div>
              <div className="overview-item stack">
                <span className="meta-label">AI review notes</span>
                <strong className="overview-value">{data.report.aiAuditFindings?.length ?? 0}</strong>
              </div>
              <div className="overview-item stack">
                <span className="meta-label">Warnings</span>
                <strong className="overview-value">{data.report.warnings.length}</strong>
              </div>
              <div className="overview-item stack">
                <span className="meta-label">Receipt status</span>
                <strong className="overview-value">{data.receipt ? "Minted" : "Offchain"}</strong>
              </div>
            </div>
          </div>

          <div className="card stack memo-section">
            <div className="section-eyebrow">Executive Summary</div>
            <h2 style={{ margin: 0 }}>Scanner Summary</h2>
            <div className="memo-body stack">
              {summaryView.paragraphs.length > 0
                ? summaryView.paragraphs.map((paragraph, index) => <p key={`summary-paragraph-${index}`}>{paragraph}</p>)
                : null}

              {summaryView.paragraphs.length === 0 && summaryView.intro ? <p>{summaryView.intro}</p> : null}

              {summaryView.keyRisks.length > 0 ? (
                <div className="scanner-summary-group">
                  <strong>Key Risks</strong>
                  <ul className="scanner-summary-list">
                    {summaryView.keyRisks.map((risk, index) => (
                      <li key={`risk-${index}`}>{risk}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {summaryView.recommendations.length > 0 ? (
                <div className="scanner-summary-group">
                  <strong>Recommendations</strong>
                  <ul className="scanner-summary-list">
                    {summaryView.recommendations.map((recommendation, index) => (
                      <li key={`recommendation-${index}`}>{recommendation}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {summaryView.paragraphs.length === 0 && summaryView.closing ? <p>{summaryView.closing}</p> : null}

              <p className="muted">
                {SCANNER_SUMMARY_NOTES[Math.min(DEFAULT_SCANNER_SUMMARY_NOTE_INDEX, SCANNER_SUMMARY_NOTES.length - 1)]}
              </p>
            </div>
          </div>

          {coverage ? (
            <div className="card stack memo-section">
              <div className="section-eyebrow">Scope</div>
              <h2 style={{ margin: 0 }}>Analysis Coverage</h2>
              <div className="metadata-grid">
                <div className="metadata-item stack">
                  <span className="meta-label">Static analysis</span>
                  <div className="meta-value">{coverage.staticAnalysis}</div>
                </div>
                <div className="metadata-item stack">
                  <span className="meta-label">AI logic review</span>
                  <div className="meta-value">{coverage.aiLogicReview}</div>
                </div>
                <div className="metadata-item stack">
                  <span className="meta-label">Input</span>
                  <div className="meta-value">{coverage.inputType}</div>
                </div>
                <div className="metadata-item stack">
                  <span className="meta-label">Report hash mode</span>
                  <div className="meta-value">{coverage.reportHashMode}</div>
                </div>
                {data.report.metadata.contractAddress ? (
                  <div className="metadata-item stack metadata-item-wide">
                    <span className="meta-label">Verified contract</span>
                    <div className="meta-value mono-wrap">{data.report.metadata.contractAddress}</div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {data.isOwner ? (
            <div className="card stack memo-section">
              <div className="section-eyebrow">Ownership & Sharing</div>
              <h2 style={{ margin: 0 }}>Administrative Controls</h2>
              <p className="muted">
                Visibility, private-link creation, and receipt minting are owner-controlled actions tied to this report.
              </p>
              <div className="action-panel stack">
                <div className="action-group">
                  <button
                    className="button secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => updateVisibility(data.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC")}
                  >
                    {data.visibility === "PUBLIC" ? "Set private" : "Set public"}
                  </button>
                  {data.visibility === "PRIVATE" ? (
                    <button className="button" type="button" disabled={busy} onClick={createShareLink}>
                      Generate private link
                    </button>
                  ) : null}
                  <button className="button warn" type="button" disabled={busy} onClick={mintReceipt}>
                    Mint onchain receipt
                  </button>
                </div>

                {shareLink ? (
                  <div className="note-panel stack">
                    <div className="muted">Private link:</div>
                    <pre>{shareLink}</pre>
                  </div>
                ) : null}

                {mintPayload ? (
                  <div className="note-panel stack">
                    <span className="meta-label">Prepared transaction payload</span>
                    <pre>{JSON.stringify(mintPayload, null, 2)}</pre>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {data.receipt ? (
            <div className="card stack memo-section">
              <div className="section-eyebrow">Provenance</div>
              <h2 style={{ margin: 0 }}>Onchain Receipt</h2>
              <div className="metadata-grid">
                <div className="metadata-item stack">
                  <span className="meta-label">Transaction hash</span>
                  <div className="meta-value mono-wrap">{data.receipt.txHash}</div>
                </div>
                <div className="metadata-item stack">
                  <span className="meta-label">Minter</span>
                  <div className="meta-value mono-wrap">{data.receipt.receiptMinter}</div>
                </div>
              </div>
              <Link className="button secondary" href={`/receipt/${data.reportId}${token ? `?token=${encodeURIComponent(token)}` : ""}`}>
                Open receipt details
              </Link>
            </div>
          ) : (
            <div className="card stack memo-section note-panel">
              <div className="section-eyebrow">Provenance</div>
              <h2 style={{ margin: 0 }}>Onchain Receipt</h2>
              <p className="muted">
                No receipt is attached yet. The report remains offchain unless the owner chooses to mint an onchain receipt.
              </p>
            </div>
          )}

          <div className="card stack memo-section">
            <div className="section-eyebrow">Key Findings</div>
            <h2 style={{ margin: 0 }}>Findings ({findings.length})</h2>
            {findings.length === 0 ? (
              <div className="note-panel stack finding-empty-state">
                <span className="meta-label">No automated findings</span>
                <p className="muted">
                  No findings were identified within the current automated review scope. This should be treated as a clean
                  automated pass, not as a substitute for manual review.
                </p>
              </div>
            ) : null}

            {groupedFindings.map((group) => (
              <div className="stack finding-group" key={group.title}>
                <div className="row finding-group-head">
                  <span className="meta-label">Severity group</span>
                  <strong>{group.title}</strong>
                </div>
                {group.items.map((finding) => (
                  <details key={finding.id} className="card finding-card">
                    <summary className="row finding-summary" style={{ cursor: "pointer" }}>
                      <span className={`badge ${finding.severity}`}>{finding.severity}</span>
                      <strong className="finding-title">{finding.title}</strong>
                      <span className="muted finding-meta">confidence: {finding.confidence}%</span>
                      {finding.needsManualCheck ? <span className="badge">needs manual check</span> : null}
                    </summary>

                    <div className="stack finding-body" style={{ marginTop: 10 }}>
                      <div className="finding-copy-block">
                        <strong>Why it matters:</strong>
                        <p>{finding.whyItMatters}</p>
                      </div>
                      <div className="finding-copy-block">
                        <strong>Fix direction:</strong>
                        <p>{finding.fixDirection}</p>
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
            ))}
          </div>

            <div className="card stack memo-section">
              <div className="section-eyebrow">AI Review Notes</div>
              <h2 style={{ margin: 0 }}>AI Audit Findings ({data.report.aiAuditFindings?.length ?? 0})</h2>
              <p className="muted">
                These notes represent AI-assisted logic review prompts that still require human confirmation before they
                should influence production decisions.
              </p>
              {(data.report.aiAuditFindings?.length ?? 0) === 0 ? (
              <div className="note-panel stack finding-empty-state">
                <span className="meta-label">No confirmed AI findings</span>
                <p className="muted">No confirmed AI findings were produced from the submitted code evidence.</p>
              </div>
            ) : null}

            {(data.report.aiAuditFindings || []).map((finding, idx) => (
              <details key={`${finding.title}-${idx}`} className="card finding-card">
                <summary className="row finding-summary" style={{ cursor: "pointer" }}>
                  <span className={`badge ${finding.severity}`}>{finding.severity}</span>
                  <strong className="finding-title">{finding.title}</strong>
                  <span className="badge">{finding.source}</span>
                </summary>
                <div className="stack finding-body" style={{ marginTop: 10 }}>
                  <div className="finding-copy-block">
                    <strong>Location:</strong>
                    <p>{finding.location}</p>
                  </div>
                  <div className="finding-copy-block">
                    <strong>Explanation:</strong>
                    <p>{finding.explanation}</p>
                  </div>
                  <div className="finding-copy-block">
                    <strong>Evidence:</strong>
                    <p>{finding.evidence}</p>
                  </div>
                  <div className="finding-copy-block">
                    <strong>Fix direction:</strong>
                    <p>{finding.fixDirection}</p>
                  </div>
                </div>
              </details>
            ))}
          </div>

          {data.report.scannerErrors.length > 0 || data.report.partialReasons.length > 0 || data.report.warnings.length > 0 ? (
            <div className="card stack memo-section note-panel caution-panel">
              <div className="section-eyebrow">Scope Notes</div>
              <h2 style={{ margin: 0 }}>Constraints and Transparency</h2>
              {data.report.warnings.length > 0 ? (
                <div className="stack">
                  <strong>Warnings</strong>
                  <ul className="scanner-summary-list">
                    {data.report.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {data.report.partialReasons.length > 0 ? (
                <div className="stack">
                  <strong>Partial reasons</strong>
                  <ul className="scanner-summary-list">
                    {data.report.partialReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {data.report.scannerErrors.length > 0 ? (
                <div className="stack">
                  <strong>Scanner errors</strong>
                  <ul className="scanner-summary-list">
                    {data.report.scannerErrors.map((scannerError) => (
                      <li key={scannerError}>{scannerError}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

        </>
      ) : null}

      {error ? <div className="card error">{error}</div> : null}
    </div>
  );
}
