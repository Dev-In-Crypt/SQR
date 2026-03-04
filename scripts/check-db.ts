import { PrismaClient } from "@prisma/client";

const REQUIRED_TABLES = [
  "users",
  "sessions",
  "analysis_requests",
  "source_bundles",
  "reports",
  "findings",
  "receipts",
  "auth_nonces",
  "rate_limits"
] as const;

function formatDatabaseTarget(rawUrl: string | undefined): string {
  if (!rawUrl) {
    return "DATABASE_URL is not set";
  }

  try {
    const parsed = new URL(rawUrl);
    const schema = parsed.searchParams.get("schema") ?? "public";
    const dbName = parsed.pathname.replace(/^\//, "") || "(unknown-db)";
    return `${parsed.hostname}:${parsed.port || "5432"}/${dbName} (schema=${schema})`;
  } catch {
    return "DATABASE_URL is set but could not be parsed";
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({ log: ["error", "warn"] });

  try {
    const target = formatDatabaseTarget(process.env.DATABASE_URL);
    console.log(`[check:db] Target: ${target}`);

    await prisma.$queryRawUnsafe("SELECT 1");

    const tableListSql = REQUIRED_TABLES.map((table) => `'${table}'`).join(", ");
    const rows = await prisma.$queryRawUnsafe<Array<{ table_name: string }>>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${tableListSql})
    `);

    const present = new Set(rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((table) => !present.has(table));

    if (missing.length > 0) {
      console.error("[check:db] Missing tables:", missing.join(", "));
      console.error("[check:db] Fix: run `npm run db:push` (or `npx prisma db push --skip-generate`).");
      process.exit(1);
    }

    await prisma.session.count();

    console.log("[check:db] OK: Prisma connection and required tables are ready.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[check:db] FAILED:", message);
  process.exit(1);
});
