export function logInfo(message: string, context: Record<string, unknown> = {}): void {
  console.log(
    JSON.stringify({
      level: "info",
      message,
      ...context,
      ts: new Date().toISOString()
    })
  );
}

export function logWarn(message: string, context: Record<string, unknown> = {}): void {
  console.warn(
    JSON.stringify({
      level: "warn",
      message,
      ...context,
      ts: new Date().toISOString()
    })
  );
}

export function logError(message: string, context: Record<string, unknown> = {}): void {
  console.error(
    JSON.stringify({
      level: "error",
      message,
      ...context,
      ts: new Date().toISOString()
    })
  );
}
