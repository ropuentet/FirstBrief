import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { ANALYSIS_VERSION, ANALYSIS_TTLS, type AnalysisFeature } from "@workspace/api-zod";
import { AnalysisError, analysisFailure, type FailureReason } from "./analysis-policy";
import { admit, readResult, requestIdentity, reusable, settle, waitResult, LIMITS } from "./analysis-store";
import { analysisContext, type AnalysisContext } from "./analysis-context";
import { logger } from "./lib/logger";

let waiters = 0;
function identities(req: Request, res: Response) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new AnalysisError("capacity", "");
  const hash = (value: string) => createHmac("sha256", secret).update(value).digest("hex");
  const saved = /(?:^|;\s*)firstbrief_beta=([a-f0-9]{32})\.([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? "");
  let visitor: string;
  if (saved && timingSafeEqual(Buffer.from(saved[2]), Buffer.from(hash(saved[1])))) visitor = saved[1];
  else {
    visitor = randomBytes(16).toString("hex");
    res.cookie("firstbrief_beta", `${visitor}.${hash(visitor)}`, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 86400000, path: "/" });
  }
  return { visitor: hash(visitor), ip: hash(req.ip ?? req.socket.remoteAddress ?? "unknown") };
}
function fail(res: Response, error: unknown) {
  const failure = analysisFailure(error);
  if (error instanceof AnalysisError && error.retryAfterMs) res.set("Retry-After", String(Math.ceil(error.retryAfterMs / 1000)));
  else if (failure.reason === "capacity") res.set("Retry-After", "30");
  res.status(["rate", "capacity"].includes(failure.reason) ? 429 : 503).json(failure);
}
export async function sharedAnalysis(req: Request, res: Response, next: NextFunction) {
  const feature = req.path.toLowerCase().replace(/\/+$/, "").slice(1) as AnalysisFeature;
  if (req.method !== "POST" || !Object.hasOwn(ANALYSIS_TTLS, feature)) { next(); return; }
  const key = requestIdentity(feature, (req.body ?? {}) as Record<string, unknown>);
  if (!key) { next(); return; } // Existing handlers own input errors; no admission.
  try {
    const cached = await readResult(feature, key);
    const sendCached = (entry: NonNullable<typeof cached>) => res.json({ ...entry.result, cached: true, cacheable: true, generationVersion: ANALYSIS_VERSION, cacheExpiresAt: entry.expiresAt.toISOString() });
    if (cached) { sendCached(cached); return; } // No rate/token charge for reads.
    const actor = identities(req, res);
    const admission = await admit(feature, key, actor.visitor, actor.ip);
    if (admission.kind === "cached") { sendCached(admission); return; }
    if (admission.kind === "wait") {
      if (waiters >= 20) throw new AnalysisError("capacity", "");
      waiters++;
      try { sendCached(await waitResult(feature, key)); } finally { waiters--; }
      return;
    }
    const context: AnalysisContext = { sent: false };
    const original = res.json.bind(res);
    let finishing = false;
    res.json = (value: unknown) => {
      if (finishing) return res;
      finishing = true;
      void (async () => {
        const success = res.statusCode < 300 && reusable(feature, value);
        const state = value as { reason?: FailureReason; status?: string; retrievalPartial?: boolean };
        const reason = success ? undefined : state.reason ?? (state.retrievalPartial ? "partial" : state.status === "insufficient" ? "evidence" : "response");
        const spent = context.sent ? context.usage ?? LIMITS.reserveTokens : 0;
        const expiresAt = await settle(feature, key, admission, value, reason, spent);
        original({ ...(value as object), cacheable: success, cached: false, generationVersion: ANALYSIS_VERSION, ...(expiresAt ? { cacheExpiresAt: expiresAt.toISOString() } : {}) });
      })().catch(error => {
        logger.warn({ reason: analysisFailure(error).reason }, "Shared analysis persistence failed");
        res.status(503);
        original(analysisFailure(error));
      });
      return res;
    };
    analysisContext.run(context, next);
  } catch (error) { fail(res, error); }
}
