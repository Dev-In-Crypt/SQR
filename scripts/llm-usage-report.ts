import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

/**
 * Daily LLM usage summary. Reads the llm_usage table and prints tokens per
 * day/model/stage. Optional cost: set LLM_PRICE_JSON to a map of
 * {"<model>": {"inPerM": <usd per 1M prompt tokens>, "outPerM": <usd per 1M completion tokens>}}.
 *
 * Usage: tsx scripts/llm-usage-report.ts [--days 30]
 */

interface PriceEntry {
  inPerM: number;
  outPerM: number;
}

function parsePrices(): Record<string, PriceEntry> {
  const raw = process.env.LLM_PRICE_JSON;
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as Record<string, PriceEntry>;
  } catch {
    console.warn("[llm:usage] LLM_PRICE_JSON is not valid JSON; skipping cost estimates");
    return {};
  }
}

function parseDays(): number {
  const index = process.argv.indexOf("--days");
  if (index !== -1 && process.argv[index + 1]) {
    const value = Number(process.argv[index + 1]);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return 30;
}

async function main() {
  const { prisma } = await import("@/lib/db");
  const days = parseDays();
  const prices = parsePrices();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await prisma.$queryRaw<
    Array<{
      day: Date;
      model: string;
      stage: string;
      prompt: bigint;
      completion: bigint;
      calls: bigint;
    }>
  >`
    SELECT date_trunc('day', "createdAt") AS day, model, stage,
           SUM("promptTokens") AS prompt, SUM("completionTokens") AS completion, COUNT(*) AS calls
    FROM llm_usage
    WHERE "createdAt" >= ${since}
    GROUP BY 1, 2, 3
    ORDER BY 1 DESC, 2, 3
  `;

  if (rows.length === 0) {
    console.log(`[llm:usage] no usage recorded in the last ${days} days`);
    await prisma.$disconnect();
    return;
  }

  console.log(`LLM usage — last ${days} days\n`);
  console.log(
    `${"day".padEnd(12)}${"model".padEnd(24)}${"stage".padEnd(14)}${"calls".padStart(7)}${"prompt".padStart(12)}${"completion".padStart(12)}${"cost($)".padStart(10)}`
  );
  console.log("-".repeat(91));

  let totalCost = 0;
  let costKnown = false;

  for (const row of rows) {
    const prompt = Number(row.prompt);
    const completion = Number(row.completion);
    const price = prices[row.model];
    let costCell = "-";
    if (price) {
      const cost = (prompt / 1_000_000) * price.inPerM + (completion / 1_000_000) * price.outPerM;
      totalCost += cost;
      costKnown = true;
      costCell = cost.toFixed(4);
    }

    const day = row.day.toISOString().slice(0, 10);
    console.log(
      `${day.padEnd(12)}${row.model.padEnd(24)}${row.stage.padEnd(14)}${String(row.calls).padStart(7)}${String(prompt).padStart(12)}${String(completion).padStart(12)}${costCell.padStart(10)}`
    );
  }

  if (costKnown) {
    console.log("-".repeat(91));
    console.log(`${"total".padEnd(81)}${totalCost.toFixed(4).padStart(10)}`);
  } else {
    console.log("\n(set LLM_PRICE_JSON to see cost estimates)");
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
