import { createHash } from "node:crypto";

export const ANALYSIS_REQUEST_OPTIONS = { timeout: 15_000, maxRetries: 0 };
const failures = new Map<string, number>();
const FAILURE_HOLD_MS = 15 * 60 * 1000;

export function analysisKey(kind: string, identity: string, content: string[]): string {
  return `${kind}:${createHash("sha256").update(JSON.stringify([identity, ...content])).digest("hex")}`;
}

export function analysisFailedRecently(key: string): boolean {
  const until = failures.get(key) ?? 0;
  if (Date.now() < until) return true;
  failures.delete(key);
  return false;
}

export function recordAnalysisFailure(key: string): void {
  for (const [item, until] of failures) {
    if (until <= Date.now()) failures.delete(item);
  }
  failures.set(key, Date.now() + FAILURE_HOLD_MS);
}
