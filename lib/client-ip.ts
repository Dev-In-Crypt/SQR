import { isIP } from "node:net";

function normalizeIpCandidate(value: string): string | null {
  const trimmed = value.trim().replace(/^"+|"+$/g, "");
  if (!trimmed) {
    return null;
  }

  if (isIP(trimmed)) {
    return trimmed;
  }

  // Handle IPv4 with a port suffix like "203.0.113.5:443".
  const ipv4PortMatch = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4PortMatch?.[1] && isIP(ipv4PortMatch[1])) {
    return ipv4PortMatch[1];
  }

  // Handle bracketed IPv6 with a port suffix like "[2001:db8::1]:443".
  const ipv6PortMatch = trimmed.match(/^\[([a-fA-F0-9:]+)\]:\d+$/);
  if (ipv6PortMatch?.[1] && isIP(ipv6PortMatch[1])) {
    return ipv6PortMatch[1];
  }

  return null;
}

function parseXForwardedFor(headerValue: string, trustedProxyHops: number): string | null {
  const candidates = headerValue
    .split(",")
    .map((part) => normalizeIpCandidate(part))
    .filter((part): part is string => Boolean(part));

  if (candidates.length === 0) {
    return null;
  }

  const index = Math.max(0, candidates.length - (trustedProxyHops + 1));
  return candidates[index] ?? null;
}

export function resolveClientIp(params: {
  getHeader: (name: string) => string | null;
  trustedHeaders: string[];
  trustedProxyHops: number;
  fallbackIp?: string;
}): string {
  for (const header of params.trustedHeaders) {
    const value = params.getHeader(header);
    if (!value) {
      continue;
    }

    if (header === "x-forwarded-for") {
      const parsed = parseXForwardedFor(value, params.trustedProxyHops);
      if (parsed) {
        return parsed;
      }
      continue;
    }

    const parsed = normalizeIpCandidate(value);
    if (parsed) {
      return parsed;
    }
  }

  return params.fallbackIp || "0.0.0.0";
}

