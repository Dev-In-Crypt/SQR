function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeValue(entry));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const normalized: Record<string, unknown> = {};

    for (const key of keys) {
      normalized[key] = normalizeValue(record[key]);
    }

    return normalized;
  }

  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}
