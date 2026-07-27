import { z } from "zod";
import { isAddress } from "viem";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/solidity_quick_review?schema=public"),
  DATABASE_URL_DIRECT: z.string().optional(),
  REDIS_URL: z.string().optional(),
  ANALYSIS_QUEUE_NAME: z.string().default("analysis-jobs"),
  BASE_CHAIN_ID: z.coerce.number().default(8453),
  STAGING_BASE_CHAIN_ID: z.coerce.number().default(84532),
  BASE_RPC_URL: z.string().optional(),
  BASE_MAINNET_RPC_URL: z.string().optional(),
  BASE_SEPOLIA_RPC_URL: z.string().optional(),
  // Arbitrum as a second analyzable network. OFF by default: when off, the chain
  // allowlist and the network dropdown stay Base-only. Analysis (source fetch via
  // Etherscan V2 + Sourcify) is already chain-agnostic; onchain receipts on
  // Arbitrum require ARBITRUM_RECEIPT_CONTRACT_ADDRESS (a registry deployed there).
  ENABLE_ARBITRUM: z.string().default("false"),
  ARBITRUM_RPC_URL: z.string().optional(),
  ARBITRUM_SEPOLIA_RPC_URL: z.string().optional(),
  ARBITRUM_RECEIPT_CONTRACT_ADDRESS: z.string().optional(),
  BASESCAN_API_URL: z.string().url().default("https://api.etherscan.io/v2/api"),
  BASESCAN_API_KEY: z.string().optional(),
  SOURCIFY_API_URL: z
    .string()
    .url()
    .default("https://repo.sourcify.dev/contracts/full_match"),
  SOURCE_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(12000),
  ANALYZER_VERSION: z.string().default("0.1.0"),
  RULESET_VERSION: z.string().default("0.1.0"),
  ANALYSIS_TOTAL_TIMEOUT_MS: z.coerce.number().int().positive().default(180000),
  STRUCTURE_EXTRACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  REPORT_GENERATION_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  ANALYSIS_STALE_TIMEOUT_MS: z.coerce.number().int().positive().default(240000),
  ANALYSIS_STALE_SWEEP_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
  SCANNER_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),
  ENABLE_FOUNDRY_CHECK: z.string().default("true"),
  FOUNDRY_TIMEOUT_MS: z.coerce.number().int().positive().default(90000),
  OPENAI_EXEC_SUMMARY_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  OPENAI_AUDIT_TIMEOUT_MS: z.coerce.number().int().positive().default(45000),
  ENABLE_SLITHER: z.string().default("true"),
  // Second static analyzer (Cyfrin Aderyn) run alongside Slither. Default OFF:
  // enabling it changes the finding set and therefore the deterministic report
  // hash, so bump ANALYZER_VERSION/RULESET_VERSION when turning it on in prod.
  ENABLE_ADERYN: z.string().default("false"),
  ADERYN_COMMAND: z.string().default("aderyn"),
  ADERYN_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  SOLC_PATH: z.string().optional(),
  ENABLE_SOLC_AUTO_RESOLVE: z.string().default("true"),
  SOLC_VERSION_MANAGER: z.string().default(""),
  SOLC_FALLBACK_PATH: z.string().optional(),
  SOLC_CACHE_DIR: z.string().optional(),
  ENABLE_STRUCTURED_AUDIT_CONTEXT: z.string().default("true"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_HTTP_REFERER: z.string().url().optional(),
  OPENAI_APP_NAME: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  OPENAI_GENERAL_MODEL: z.string().optional(),
  OPENAI_AUDIT_MODEL: z.string().optional(),
  // Multi-model consensus for the AI audit. OFF by default (each extra model is
  // another LLM call). When on with ≥2 models, the audit runs on each and every
  // finding is scored by how many models independently raised it. AI output is
  // outside the deterministic report hash, so this never affects provenance.
  ENABLE_AI_CONSENSUS: z.string().default("false"),
  OPENAI_CONSENSUS_MODELS: z.string().default(""),
  AI_CONSENSUS_MIN_AGREEMENT: z.coerce.number().int().min(1).default(1),
  OPENAI_TEMPERATURE: z.coerce.number().default(0),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  RECEIPT_CONTRACT_ADDRESS: z.string().optional(),
  TRUSTED_IP_HEADERS: z
    .string()
    .default("cf-connecting-ip,x-real-ip,x-vercel-forwarded-for,x-forwarded-for"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  SESSION_COOKIE_NAME: z.string().default("sqr_session"),
  SESSION_DAYS: z.coerce.number().default(30),
  PRIVATE_LINK_SECRET: z.string().default("dev-secret-change-me"),
  RATE_LIMIT_ANON_PER_DAY: z.coerce.number().int().min(0).default(3),
  RATE_LIMIT_WALLET_PER_DAY: z.coerce.number().int().min(0).default(10),
  RATE_LIMIT_AUTH_IP_PER_DAY: z.coerce.number().int().min(0).default(10),
  RATE_LIMIT_PUBLIC_LOOKUP_PER_DAY: z.coerce.number().int().min(0).default(120),
  RATE_LIMIT_QUICK_SCAN_PER_DAY: z.coerce.number().int().min(0).default(10),
  PAYMENTS_ENABLED: z.string().default("false"),
  PAYMENT_PRICE_USDC: z.coerce.number().positive().default(5),
  PAYMENT_RECEIVER_ADDRESS: z.string().optional(),
  CDP_API_KEY_ID: z.string().optional(),
  CDP_API_KEY_SECRET: z.string().optional(),
  ANALYSIS_REUSE_WINDOW_MINUTES: z.coerce.number().int().positive().default(1440)
});

function ensureProductionConfig(env: z.infer<typeof envSchema>): void {
  if (env.APP_ENV !== "production") {
    return;
  }

  const problems: string[] = [];

  if (!env.RECEIPT_CONTRACT_ADDRESS) {
    problems.push("RECEIPT_CONTRACT_ADDRESS is required when APP_ENV=production");
  } else if (!isAddress(env.RECEIPT_CONTRACT_ADDRESS)) {
    problems.push("RECEIPT_CONTRACT_ADDRESS must be a valid 20-byte hex address");
  }

  if (!env.BASE_MAINNET_RPC_URL && !env.BASE_RPC_URL) {
    problems.push("BASE_MAINNET_RPC_URL (or BASE_RPC_URL) is required when APP_ENV=production");
  }

  if (env.PRIVATE_LINK_SECRET === "dev-secret-change-me") {
    problems.push("PRIVATE_LINK_SECRET must be replaced in production");
  } else if (env.PRIVATE_LINK_SECRET.length < 32) {
    problems.push("PRIVATE_LINK_SECRET must be at least 32 characters in production");
  }

  if (env.PAYMENTS_ENABLED.toLowerCase() === "true") {
    if (!env.PAYMENT_RECEIVER_ADDRESS || !isAddress(env.PAYMENT_RECEIVER_ADDRESS)) {
      problems.push("PAYMENT_RECEIVER_ADDRESS must be a valid address when PAYMENTS_ENABLED=true");
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid production configuration: ${problems.join("; ")}`);
  }
}

function parseEnv(rawEnv: NodeJS.ProcessEnv): z.infer<typeof envSchema> {
  const parsed = envSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${formatted}`);
  }

  ensureProductionConfig(parsed.data);
  return parsed.data;
}

export function buildConfig(rawEnv: NodeJS.ProcessEnv = process.env) {
  const env = parseEnv(rawEnv);
  const openAiGeneralModel = env.OPENAI_GENERAL_MODEL?.trim() || env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
  const openAiAuditModel = env.OPENAI_AUDIT_MODEL?.trim() || openAiGeneralModel;

  return {
    ...env,
    OPENAI_GENERAL_MODEL: openAiGeneralModel,
    OPENAI_AUDIT_MODEL: openAiAuditModel,
    structuredAuditContextEnabled: env.ENABLE_STRUCTURED_AUDIT_CONTEXT.toLowerCase() === "true",
    paymentsEnabled: env.PAYMENTS_ENABLED.toLowerCase() === "true",
    trustedIpHeaders: env.TRUSTED_IP_HEADERS
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0),
    isProd: env.NODE_ENV === "production",
    slitherEnabled: env.ENABLE_SLITHER.toLowerCase() === "true",
    foundryEnabled: env.ENABLE_FOUNDRY_CHECK.toLowerCase() === "true",
    aderynEnabled: env.ENABLE_ADERYN.toLowerCase() === "true",
    aiConsensusEnabled: env.ENABLE_AI_CONSENSUS.toLowerCase() === "true",
    aiConsensusModels: env.OPENAI_CONSENSUS_MODELS.split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
    arbitrumEnabled: env.ENABLE_ARBITRUM.toLowerCase() === "true"
  };
}

export const config = buildConfig();
