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
  OPENAI_TEMPERATURE: z.coerce.number().default(0),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  RECEIPT_CONTRACT_ADDRESS: z.string().optional(),
  TRUSTED_IP_HEADERS: z
    .string()
    .default("cf-connecting-ip,x-real-ip,x-vercel-forwarded-for,x-forwarded-for"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(1),
  SESSION_COOKIE_NAME: z.string().default("sqr_session"),
  SESSION_DAYS: z.coerce.number().default(30),
  PRIVATE_LINK_SECRET: z.string().default("dev-secret-change-me")
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
    trustedIpHeaders: env.TRUSTED_IP_HEADERS
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0),
    isProd: env.NODE_ENV === "production",
    slitherEnabled: env.ENABLE_SLITHER.toLowerCase() === "true",
    foundryEnabled: env.ENABLE_FOUNDRY_CHECK.toLowerCase() === "true"
  };
}

export const config = buildConfig();
