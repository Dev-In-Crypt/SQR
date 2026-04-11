import { createHmac } from "node:crypto";

interface ClaimResponse {
  id?: string;
  message?: string;
}

function mustEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

function buildSignature(params: {
  method: string;
  path: string;
  date: string;
  username: string;
  secret: string;
}): string {
  const canonical = `x-date: ${params.date}\n${params.method.toUpperCase()} ${params.path} HTTP/1.1`;
  const digest = createHmac("sha256", params.secret).update(canonical).digest("base64");

  return `hmac username="${params.username}", algorithm="hmac-sha256", headers="x-date request-line", signature="${digest}"`;
}

async function main() {
  const faucetBaseUrl = process.env.HASHKEY_FAUCET_API_URL?.trim() || "https://faucet-api.hashkeychain.net";
  const address = mustEnv("HASHKEY_FAUCET_ADDRESS");
  const token = mustEnv("HASHKEY_FAUCET_RECAPTCHA_TOKEN");
  const username = process.env.HASHKEY_FAUCET_HMAC_USERNAME?.trim() || "faucet";
  const secret = process.env.HASHKEY_FAUCET_HMAC_SECRET?.trim() || "dce7OzR8GyYd";

  const path = "/api/faucet/drip";
  const date = new Date().toUTCString();
  const signature = buildSignature({
    method: "POST",
    path,
    date,
    username,
    secret
  });

  const response = await fetch(`${faucetBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-date": date,
      "x-timestamp": date,
      "x-signature": signature
    },
    body: JSON.stringify({
      token,
      address
    })
  });

  const body = (await response.json()) as ClaimResponse;
  if (!response.ok) {
    throw new Error(`Faucet request failed (${response.status}): ${JSON.stringify(body)}`);
  }

  if (!body.id) {
    throw new Error(`Faucet response did not include tx id: ${JSON.stringify(body)}`);
  }

  console.log(`faucet_request_id=${body.id}`);
}

void main();
