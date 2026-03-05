import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/solidity_quick_review?schema=public"),
  REDIS_URL: z.string().optional(),
  BASE_CHAIN_ID: z.coerce.number().default(8453),
  STAGING_BASE_CHAIN_ID: z.coerce.number().default(84532),
  BASE_RPC_URL: z.string().optional(),
  BASESCAN_API_URL: z.string().url().default("https://api.basescan.org/api"),
  BASESCAN_API_KEY: z.string().optional(),
  SOURCIFY_API_URL: z
    .string()
    .url()
    .default("https://repo.sourcify.dev/contracts/full_match"),
  ANALYZER_VERSION: z.string().default("0.1.0"),
  RULESET_VERSION: z.string().default("0.1.0"),
  ENABLE_SLITHER: z.string().default("true"),
  SOLC_PATH: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_TEMPERATURE: z.coerce.number().default(0),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  RECEIPT_CONTRACT_ADDRESS: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().default("sqr_session"),
  SESSION_DAYS: z.coerce.number().default(30),
  PRIVATE_LINK_SECRET: z.string().default("dev-secret-change-me")
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const formatted = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment: ${formatted}`);
}

const env = parsed.data;

export const config = {
  ...env,
  isProd: env.NODE_ENV === "production",
  slitherEnabled: env.ENABLE_SLITHER.toLowerCase() === "true"
};
