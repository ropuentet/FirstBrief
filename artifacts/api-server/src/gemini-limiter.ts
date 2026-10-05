/**
 * Shared Gemini call queue.
 *
 * The Gemini free tier allows 15 requests per minute (~4 s/request).
 * When the app loads it fires multiple WIM + sentiment calls simultaneously
 * for different articles. Without serialisation every simultaneous call hits
 * the quota at once, the 429 cooldown resets, and the loop repeats.
 *
 * This module exports a single `enqueueGeminiCall` function. All Gemini calls
 * across all routes go through this queue, which:
 *   1. Allows exactly ONE in-flight Gemini HTTP request at a time.
 *   2. Enforces a MIN_GAP_MS pause between consecutive calls.
 *   3. Rejects quota-blocked work immediately; never waits for a quota reset.
 */

import { logger } from "./lib/logger";
import { AnalysisError } from "./analysis-policy";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const MIN_GAP_MS = 5_000;   // 12 RPM max — safely under the 15 RPM free-tier cap
const MAX_QUEUE  = 50;       // drop excess to avoid unbounded memory growth

let lastCallEndedAt = 0;
let processing      = false;

interface QueueEntry<T> {
  fn:      () => Promise<T>;
  resolve: (v: T)           => void;
  reject:  (e: unknown)     => void;
  deadline: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const queue: QueueEntry<any>[] = [];

// Shared 429 cooldown — set by any route, respected by all
const holdFile = path.resolve(".cache/firstbrief-gemini-backoff.json");
let sharedCooldownUntil = 0;
try {
  const saved = JSON.parse(readFileSync(holdFile, "utf8"));
  if (Number.isFinite(saved.until)) sharedCooldownUntil = saved.until;
} catch { /* No persisted local hold yet. */ }

export function setGeminiCooldown(untilMs: number): void {
  if (untilMs > sharedCooldownUntil) sharedCooldownUntil = untilMs;
  try {
    mkdirSync(path.dirname(holdFile), { recursive: true });
    writeFileSync(holdFile, JSON.stringify({ until: sharedCooldownUntil }));
  } catch { logger.warn("Could not persist local Gemini quota backoff"); }
}

export function isGeminiCoolingDown(): boolean {
  return Date.now() < sharedCooldownUntil;
}

export function geminiCooldownMs(): number {
  return Math.max(0, sharedCooldownUntil - Date.now());
}

export function recordGeminiQuota(errorMsg: string): void {
  const hint = /retry in\s+((?:[0-9.]+\s*[hms]\s*)+)/i.exec(errorMsg)?.[1];
  let delay = 0;
  for (const token of hint?.matchAll(/([0-9.]+)\s*([hms])/gi) ?? []) {
    delay += Number(token[1]) * ({ h: 3_600_000, m: 60_000, s: 1000 }[token[2].toLowerCase()] ?? 0);
  }
  // Internal backoff only, not a claimed provider reset time.
  setGeminiCooldown(Date.now() + (delay > 0 ? delay + 1000 : 15 * 60 * 1000));
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    if (isGeminiCoolingDown()) {
      for (const entry of queue.splice(0)) {
        entry.reject(new AnalysisError("quota", "Analysis temporarily unavailable"));
      }
      break;
    }
    // Enforce minimum gap between consecutive calls
    const sinceLast = Date.now() - lastCallEndedAt;
    if (sinceLast < MIN_GAP_MS) {
      await sleep(MIN_GAP_MS - sinceLast);
    }

    const entry = queue.shift();
    if (!entry) break;
    if (isGeminiCoolingDown() || Date.now() >= entry.deadline) {
      entry.reject(new AnalysisError(isGeminiCoolingDown() ? "quota" : "timeout", "Analysis temporarily unavailable"));
      continue;
    }

    try {
      const result = await entry.fn();
      lastCallEndedAt = Date.now();
      entry.resolve(result);
    } catch (err) {
      lastCallEndedAt = Date.now();
      const message = err instanceof Error ? err.message : String(err);
      if (/429|quota/i.test(message)) recordGeminiQuota(message);
      entry.reject(err);
    }
  }

  processing = false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Enqueue a Gemini API call. The call will be executed after any in-progress
 * call finishes and the minimum inter-call gap has elapsed.
 *
 * @throws if the queue is full (> MAX_QUEUE pending items)
 */
export function enqueueGeminiCall<T>(fn: () => Promise<T>): Promise<T> {
  if (isGeminiCoolingDown()) {
    return Promise.reject(new AnalysisError("quota", "Analysis temporarily unavailable"));
  }
  if (queue.length >= MAX_QUEUE) {
    return Promise.reject(new Error("[gemini-limiter] queue full — request dropped"));
  }

  const p = new Promise<T>((resolve, reject) => {
    const entry: QueueEntry<T> = { fn, resolve, reject, deadline: Date.now() + 10_000 };
    const timer = setTimeout(() => {
      const index = queue.indexOf(entry);
      if (index >= 0) {
        queue.splice(index, 1);
        reject(new Error("Analysis queue timed out"));
      }
    }, 10_000);
    entry.resolve = value => { clearTimeout(timer); resolve(value); };
    entry.reject = error => { clearTimeout(timer); reject(error); };
    queue.push(entry);
  });

  // Kick off the processor (no-op if already running)
  processQueue().catch(err => {
    logger.error({ err }, "Gemini queue processor failed");
  });

  return p;
}
