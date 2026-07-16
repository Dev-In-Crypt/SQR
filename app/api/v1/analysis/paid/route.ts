import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withX402 } from "x402-next";

import {
  analysisInputHash,
  findReusableAnalysis,
  intakeAnalysis,
  validateAnalysisAccess
} from "@/lib/analysis-intake";
import { ok, fail, handleRouteError } from "@/lib/api";
import { config } from "@/lib/config";
import {
  decodeSettlementHeader,
  findRetryCredit,
  paymentFacilitator,
  paymentNetwork,
  paymentPriceString,
  paymentReceiver,
  recordSettledPayment,
  consumeRetryCredit
} from "@/lib/payments";
import { getSessionContext } from "@/lib/session";
import { createAnalysisSchema } from "@/lib/validation";

export const runtime = "nodejs";

const SETTLEMENT_HEADER = "X-PAYMENT-RESPONSE";

type PreparedRequest = {
  payload: z.infer<typeof createAnalysisSchema>;
  session: Awaited<ReturnType<typeof getSessionContext>>;
  inputHash: string;
};

async function prepare(request: NextRequest): Promise<PreparedRequest | NextResponse> {
  let payloadRaw: unknown;
  try {
    payloadRaw = await request.clone().json();
  } catch {
    return fail(400, "INVALID_PAYLOAD", "Request body must be JSON");
  }

  const session = await getSessionContext();

  const parsed = createAnalysisSchema.safeParse(payloadRaw);
  if (!parsed.success) {
    return fail(
      400,
      "INVALID_PAYLOAD",
      parsed.error.issues.map((issue) => issue.message).join("; ")
    );
  }

  try {
    validateAnalysisAccess(parsed.data, session);
  } catch (error) {
    return handleRouteError(error, { route: "POST /api/v1/analysis/paid" });
  }

  return { payload: parsed.data, session, inputHash: analysisInputHash(parsed.data) };
}

async function runIntake(prepared: PreparedRequest): Promise<NextResponse> {
  const result = await intakeAnalysis({
    payload: prepared.payload,
    inputHash: prepared.inputHash,
    session: prepared.session
  });

  return ok(
    {
      analysisId: result.analysisId,
      status: result.status,
      inputHash: result.inputHash,
      errorCode: result.errorCode,
      paid: true
    },
    202
  );
}

// The x402-wrapped handler: verification runs before it, settlement after it
// returns <400. A reusable report must therefore exit with an error status so
// the user is never charged for a report they already have.
const paidHandler = async (request: NextRequest): Promise<NextResponse> => {
  try {
    const prepared = await prepare(request);
    if (prepared instanceof NextResponse) {
      return prepared;
    }

    const existing = await findReusableAnalysis({
      inputHash: prepared.inputHash,
      session: prepared.session
    });
    if (existing) {
      return fail(409, "REPORT_ALREADY_AVAILABLE", "A recent report for this input already exists", {
        analysisId: existing.id,
        status: "EXISTING"
      });
    }

    return await runIntake(prepared);
  } catch (error) {
    return handleRouteError(error, { route: "POST /api/v1/analysis/paid" });
  }
};

let protectedPost: ((request: NextRequest) => Promise<NextResponse | Response>) | null = null;

function getProtectedPost() {
  if (!protectedPost) {
    protectedPost = withX402(
      paidHandler,
      paymentReceiver(),
      {
        price: paymentPriceString(),
        network: paymentNetwork(),
        config: {
          description: "Solidity Quick Review — full analysis above the free daily limit",
          maxTimeoutSeconds: 300
        }
      },
      paymentFacilitator() as Parameters<typeof withX402>[3]
    );
  }

  return protectedPost;
}

export async function POST(request: NextRequest) {
  try {
    if (!config.paymentsEnabled) {
      return fail(404, "PAYMENTS_DISABLED", "Paid analyses are not enabled");
    }

    // A failed paid run grants a retry credit: consume it before asking for money.
    const prepared = await prepare(request);
    if (prepared instanceof NextResponse) {
      return prepared;
    }

    const credit = await findRetryCredit(prepared.session);
    if (credit) {
      const existing = await findReusableAnalysis({
        inputHash: prepared.inputHash,
        session: prepared.session
      });
      if (existing) {
        return ok({ analysisId: existing.id, status: "EXISTING", inputHash: prepared.inputHash }, 202);
      }

      const response = await runIntake(prepared);
      const body = (await response.clone().json()) as { analysisId?: string };
      if (body.analysisId) {
        await consumeRetryCredit(credit.id, body.analysisId);
      }
      return response;
    }

    const response = await getProtectedPost()(request);

    const settlementHeader = response.headers.get(SETTLEMENT_HEADER);
    if (settlementHeader && response.status < 400) {
      const settlement = decodeSettlementHeader(settlementHeader);
      if (settlement?.success) {
        let analysisId: string | null = null;
        try {
          const body = (await response.clone().json()) as { analysisId?: string };
          analysisId = body.analysisId ?? null;
        } catch {
          analysisId = null;
        }

        await recordSettledPayment({ settlement, analysisId, session: prepared.session });
      }
    }

    return response as NextResponse;
  } catch (error) {
    return handleRouteError(error, { route: "POST /api/v1/analysis/paid" });
  }
}
