import { NextResponse } from "next/server";

import { ApiError } from "@/lib/errors";
import { logError } from "@/lib/logger";

type PrismaLikeError = Error & {
  code?: string;
  meta?: {
    table?: string;
  };
};

function asPrismaError(error: unknown): PrismaLikeError | null {
  if (!(error instanceof Error)) {
    return null;
  }

  return error as PrismaLikeError;
}

function getMissingTableInfo(error: unknown): { table?: string } | null {
  const prismaError = asPrismaError(error);
  if (!prismaError) {
    return null;
  }

  const message = prismaError.message.toLowerCase();
  const missingByCode = prismaError.code === "P2021";
  const missingByMessage = message.includes("table") && message.includes("does not exist");

  if (!missingByCode && !missingByMessage) {
    return null;
  }

  const tableFromMeta =
    prismaError.meta && typeof prismaError.meta.table === "string" ? prismaError.meta.table : undefined;

  const match = prismaError.message.match(/table\s+["'`]?([a-zA-Z0-9_.]+)["'`]?\s+does not exist/i);
  const tableFromMessage = match?.[1];

  return {
    table: tableFromMeta ?? tableFromMessage
  };
}

function isDatabaseUnavailable(error: unknown): boolean {
  const prismaError = asPrismaError(error);
  if (!prismaError) {
    return false;
  }

  if (prismaError.code === "P1001" || prismaError.code === "P1002") {
    return true;
  }

  const message = prismaError.message.toLowerCase();
  return (
    message.includes("can't reach database server") ||
    message.includes("database server") && message.includes("timed out")
  );
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function fail(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function parseJsonBody<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ApiError(400, "INVALID_PAYLOAD", "Malformed JSON body");
    }

    throw error;
  }
}

export function handleRouteError(error: unknown, context: Record<string, unknown> = {}): NextResponse {
  if (error instanceof ApiError) {
    return fail(error.status, error.code, error.message);
  }

  const missingTable = getMissingTableInfo(error);
  if (missingTable) {
    const suffix = missingTable.table ? ` Missing table: ${missingTable.table}.` : "";
    return fail(
      503,
      "DB_NOT_READY",
      `Database schema is not initialized.${suffix} Run 'npm run db:push' and retry.`
    );
  }

  if (isDatabaseUnavailable(error)) {
    return fail(
      503,
      "DB_UNAVAILABLE",
      "Database is unreachable. Check DATABASE_URL and ensure PostgreSQL is running."
    );
  }

  logError("Unhandled route error", {
    ...context,
    err:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : String(error)
  });

  return fail(500, "INTERNAL_ERROR", "Unexpected server error");
}
