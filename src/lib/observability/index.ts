/**
 * Phase 0 stub — structured logging / tracing arrive in later phases.
 * Never log secrets, tokens, or unnecessary sensitive payloads.
 */
export function logInfo(message: string, context?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "development") {
    console.info(message, context ?? {});
  }
}
