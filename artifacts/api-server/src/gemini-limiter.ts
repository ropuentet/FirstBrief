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
 *   3. Respects any active 429 cooldown — queued work waits until it clears.
 */

const MIN_GAP_MS = 5_000;   // 12 RPM max — safely under the 15 RPM free-tier cap
const MAX_QUEUE  = 50;       // drop excess to avoid unbounded memory growth

let lastCallEndedAt = 0;
let processing      = false;

interface QueueEntry<T> {
  fn:      () => Promise<T>;
  resolve: (v: T)           => void;
  reject:  (e: unknown)     => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const queue: QueueEntry<any>[] = [];

// Shared 429 cooldown — set by any route, respected by all
let sharedCooldownUntil = 0;

export function setGeminiCooldown(untilMs: number): void {
  if (untilMs > sharedCooldownUntil) sharedCooldownUntil = untilMs;
}

export function isGeminiCoolingDown(): boolean {
  return Date.now() < sharedCooldownUntil;
}

export function geminiCooldownMs(): number {
  return Math.max(0, sharedCooldownUntil - Date.now());
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    // Wait out any shared cooldown before each call
    const cooldownMs = geminiCooldownMs();
    if (cooldownMs > 0) {
      console.log(`[gemini-limiter] cooldown — waiting ${Math.ceil(cooldownMs / 1000)}s before next call`);
      await sleep(cooldownMs);
    }

    // Enforce minimum gap between consecutive calls
    const sinceLast = Date.now() - lastCallEndedAt;
    if (sinceLast < MIN_GAP_MS) {
      await sleep(MIN_GAP_MS - sinceLast);
    }

    const entry = queue.shift();
    if (!entry) break;

    try {
      const result = await entry.fn();
      lastCallEndedAt = Date.now();
      entry.resolve(result);
    } catch (err) {
      lastCallEndedAt = Date.now();
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
  if (queue.length >= MAX_QUEUE) {
    return Promise.reject(new Error("[gemini-limiter] queue full — request dropped"));
  }

  const p = new Promise<T>((resolve, reject) => {
    queue.push({ fn, resolve, reject });
  });

  // Kick off the processor (no-op if already running)
  processQueue().catch(err => {
    console.error("[gemini-limiter] processor crashed:", err);
  });

  return p;
}
