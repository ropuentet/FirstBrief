import { createHash } from "node:crypto";

export const ANALYSIS_REQUEST_OPTIONS = { timeout: 15_000, maxRetries: 0 };
export type FailureReason = "quota" | "auth" | "timeout" | "input" | "provider" | "response" | "retrieval";
export class AnalysisError extends Error {
  constructor(public reason: FailureReason, message: string) { super(message); }
}
export function analysisFailure(error: unknown): { reason: FailureReason; error: string } {
  const message = error instanceof Error ? error.message : String(error);
  const reason = error instanceof AnalysisError ? error.reason
    : /429|rate limit|quota|RESOURCE_EXHAUSTED/i.test(message) ? "quota"
    : /401|403|API.key|credential|unauthorized|permission.denied/i.test(message) ? "auth"
    : /timeout|timed.out|abort/i.test(message) ? "timeout"
    : /empty.response|empty.outline|JSON|parse|invalid.response/i.test(message) ? "response" : "provider";
  const messages: Record<FailureReason, string> = {
    quota: "The AI provider reported a quota or rate limit. No automatic retry will be made.",
    auth: "AI credentials or configuration need attention.",
    timeout: "Analysis took too long. You can explicitly try again.",
    input: "There is not enough publisher-provided text to analyse.",
    provider: "The AI provider is unavailable right now.",
    response: "The provider response could not be used.",
    retrieval: "Bluesky posts could not be retrieved. This is not evidence of no discussion.",
  };
  return { reason, error: messages[reason] };
}
const failures = new Map<string, { until: number; reason: FailureReason }>();
const FAILURE_HOLD_MS = 15 * 60 * 1000;

export function analysisKey(kind: string, identity: string, content: string[]): string {
  return `${kind}:${createHash("sha256").update(JSON.stringify([identity, ...content])).digest("hex")}`;
}

export function analysisFailedRecently(key: string): boolean {
  const until = failures.get(key)?.until ?? 0;
  if (Date.now() < until) return true;
  failures.delete(key);
  return false;
}

export function clearAnalysisFailure(key: string): void { failures.delete(key); }
export function previousAnalysisFailure(key: string) { return analysisFailure(new AnalysisError(failures.get(key)?.reason ?? "provider", "")); }
export function recordAnalysisFailure(key: string, error?: unknown): void {
  for (const [item, entry] of failures) {
    if (entry.until <= Date.now()) failures.delete(item);
  }
  failures.set(key, { until: Date.now() + FAILURE_HOLD_MS, reason: analysisFailure(error).reason });
}
