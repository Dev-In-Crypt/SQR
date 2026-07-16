import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";

/**
 * Local x402 v1 facilitator stub for hermetic payment tests.
 *
 * Wire contract pinned against node_modules/x402/dist/esm/verify/index.mjs
 * (x402@1.x, used by x402-next@1.2.0):
 *   POST /verify  body {x402Version, paymentPayload, paymentRequirements}
 *                 -> 200 {isValid: boolean, invalidReason?, payer?}
 *   POST /settle  same body -> 200 {success: boolean, transaction, network, payer, errorReason?}
 *   GET  /supported -> 200 {kinds: [{scheme, network}]}
 * Re-check this file whenever the x402/x402-next packages are upgraded.
 *
 * Control endpoints (test-only, not part of the protocol):
 *   GET  /__stats -> {verifyCalls, settleCalls}
 *   POST /__mode  body {mode: "ok" | "verify-invalid" | "settle-fail"}
 */

export type FacilitatorStubMode = "ok" | "verify-invalid" | "settle-fail";

export interface FacilitatorStub {
  url: string;
  stop: () => Promise<void>;
  stats: () => { verifyCalls: number; settleCalls: number };
  setMode: (mode: FacilitatorStubMode) => void;
}

type PaymentBody = {
  paymentPayload?: {
    payload?: {
      authorization?: {
        from?: string;
      };
    };
  };
};

function readBody(request: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => resolve(data));
    request.on("error", reject);
  });
}

function payerFrom(body: string): string {
  try {
    const parsed = JSON.parse(body) as PaymentBody;
    return parsed.paymentPayload?.payload?.authorization?.from ?? "0x0000000000000000000000000000000000000000";
  } catch {
    return "0x0000000000000000000000000000000000000000";
  }
}

export async function startFacilitatorStub(port = 0): Promise<FacilitatorStub> {
  let mode: FacilitatorStubMode = "ok";
  let verifyCalls = 0;
  let settleCalls = 0;

  const server: Server = createServer((req, res) => {
    void (async () => {
      const respond = (status: number, payload: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      };

      if (req.method === "GET" && req.url === "/supported") {
        return respond(200, { kinds: [{ scheme: "exact", network: "base" }] });
      }

      if (req.method === "GET" && req.url === "/__stats") {
        return respond(200, { verifyCalls, settleCalls });
      }

      if (req.method === "POST" && req.url === "/__mode") {
        const body = await readBody(req);
        try {
          const parsed = JSON.parse(body) as { mode?: FacilitatorStubMode };
          if (parsed.mode === "ok" || parsed.mode === "verify-invalid" || parsed.mode === "settle-fail") {
            mode = parsed.mode;
            return respond(200, { mode });
          }
        } catch {
          // fall through to 400
        }
        return respond(400, { error: "invalid mode" });
      }

      if (req.method === "POST" && req.url === "/verify") {
        verifyCalls += 1;
        const body = await readBody(req);
        const payer = payerFrom(body);

        if (mode === "verify-invalid") {
          return respond(200, { isValid: false, invalidReason: "insufficient_funds", payer });
        }

        return respond(200, { isValid: true, payer });
      }

      if (req.method === "POST" && req.url === "/settle") {
        settleCalls += 1;
        const body = await readBody(req);
        const payer = payerFrom(body);

        if (mode === "settle-fail") {
          return respond(200, {
            success: false,
            errorReason: "settlement_failed",
            transaction: "",
            network: "base",
            payer
          });
        }

        return respond(200, {
          success: true,
          transaction: `0x${randomBytes(32).toString("hex")}`,
          network: "base",
          payer
        });
      }

      return respond(404, { error: "not found" });
    })().catch(() => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "stub failure" }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Facilitator stub failed to bind a port");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    stop: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    stats: () => ({ verifyCalls, settleCalls }),
    setMode: (next) => {
      mode = next;
    }
  };
}
