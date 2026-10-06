import { randomUUID } from "node:crypto";
import { ANALYSIS_TTLS, ANALYSIS_VERSION, type AnalysisFeature } from "@workspace/api-zod";
import { AnalysisError, analysisKey, type FailureReason } from "./analysis-policy";
import type { PoolClient } from "@workspace/db";
type Client = PoolClient;
type Stored = { key: string; result: unknown; version: string; expires_at: Date | null; lease_until: Date | null; retry_after: Date | null; failure_reason: FailureReason | null };
export const LIMITS = { visitorMinute: 3, visitorHour: 12, ipMinute: 12, ipHour: 60, sharedMinute: 6, sharedDay: 60, dayTokens: 150000, reserveTokens: 8000, active: 1, rows: 1000, bytes: 65536, leaseMs: 40000 } as const;
let database: Promise<typeof import("@workspace/db")> | undefined;
async function storage() {
  try { return (await (database ??= import("@workspace/db"))).pool; }
  catch { database = undefined; throw new AnalysisError("storage", ""); }
}
async function query(text: string, params: unknown[] = []) {
  try { return await (await storage()).query(text, params); }
  catch { throw new AnalysisError("storage", ""); }
}
async function transaction<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  let client: Client | undefined;
  try {
    client = await (await storage()).connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '2000ms'");
    await client.query("SELECT pg_advisory_xact_lock(71948261)");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => {});
    throw error instanceof AnalysisError ? error : new AnalysisError("storage", "");
  } finally { client?.release(); }
}
const string = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function requestIdentity(feature: AnalysisFeature, body: Record<string, unknown>): string | undefined {
  const headline = string(body.headline);
  if (feature === "sentiment") {
    if (!string(body.clusterId) || !headline) return undefined;
    return analysisKey("sentiment", string(body.articleUrl) || string(body.clusterId), [headline, string(body.rundown), string(body.topic), typeof body.publishedAt === "string" ? body.publishedAt : ""]);
  }
  const summary = string(body.summary), articleBody = string(body.body);
  if (!summary && !articleBody) return undefined;
  return analysisKey(feature === "why-it-matters" ? "wim" : "outline", string(body.url) || (feature === "why-it-matters" ? string(body.articleId) : ""), [headline, summary, articleBody]);
}
export function reusable(feature: AnalysisFeature, value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (result.retrievalPartial === true || result.cacheable === false) return false;
  const text = feature === "why-it-matters" ? result.whyItMatters : feature === "article-outline" ? result.outline : result.status === "ok" ? result.interpretation : result.summary;
  if (typeof text !== "string" || !text.trim() || Buffer.byteLength(JSON.stringify(result)) > LIMITS.bytes) return false;
  if (feature !== "sentiment") return true;
  if (!["ok", "small_sample", "qualitative"].includes(String(result.status)) || result.source !== "Bluesky" ||
    !Number.isFinite(Date.parse(String(result.observedAt))) || !Number.isInteger(result.postCount) || Number(result.postCount) < 3 ||
    !Array.isArray(result.evidence) || result.evidence.length !== result.postCount) return false;
  if (!result.evidence.every(post => {
    if (!post || typeof post.url !== "string" || typeof post.text !== "string" || typeof post.author !== "string") return false;
    try { return new URL(post.url).hostname === "bsky.app" && post.match === "ai_verified"; } catch { return false; }
  })) return false;
  if (result.status !== "small_sample" && (!Array.isArray(result.themes) || !result.themes.every(theme => typeof theme === "string"))) return false;
  return result.status !== "ok" || [result.positive, result.neutral, result.negative].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100);
}
function fresh(feature: AnalysisFeature, row?: Stored) {
  if (!row || row.version !== ANALYSIS_VERSION || !row.expires_at || row.expires_at.getTime() <= Date.now() || !reusable(feature, row.result)) return null;
  // A corrupted/old timestamp must never extend the Bluesky freshness window.
  if (feature === "sentiment" && Date.parse(String(row.result.observedAt)) + ANALYSIS_TTLS.sentiment <= Date.now()) return null;
  return { result: row.result, expiresAt: row.expires_at };
}
export async function readResult(feature: AnalysisFeature, key: string) {
  return fresh(feature, (await query("SELECT * FROM firstbrief_analysis_results WHERE key=$1", [key])).rows[0]);
}
export async function providerState(): Promise<Record<string, number>> {
  return (await query("SELECT metadata FROM firstbrief_analysis_budgets WHERE key='provider'")).rows[0]?.metadata ?? {};
}
export async function saveProviderState(metadata: Record<string, number>) {
  await query(`INSERT INTO firstbrief_analysis_budgets(key,metadata,expires_at) VALUES('provider',$1,now()+interval '2 days')
    ON CONFLICT(key) DO UPDATE SET metadata=EXCLUDED.metadata, expires_at=EXCLUDED.expires_at`, [metadata]);
}
export type Admission = { kind: "cached"; result: Record<string, unknown>; expiresAt: Date } | { kind: "wait" } | { kind: "owner"; owner: string; dayKey: string };
export async function admit(feature: AnalysisFeature, key: string, visitor: string, ip: string): Promise<Admission> {
  return transaction(async client => {
    const now = new Date((await client.query("SELECT clock_timestamp() AS now")).rows[0].now).getTime();
    const row: Stored | undefined = (await client.query("SELECT * FROM firstbrief_analysis_results WHERE key=$1", [key])).rows[0];
    const cached = fresh(feature, row);
    if (cached) return { kind: "cached", ...cached };
    if (row?.lease_until && row.lease_until.getTime() > now) return { kind: "wait" };
    if (row?.retry_after && row.retry_after.getTime() > now) throw new AnalysisError(row.failure_reason ?? "capacity", "", row.retry_after.getTime() - now);
    const provider = (await client.query("SELECT metadata FROM firstbrief_analysis_budgets WHERE key='provider'")).rows[0]?.metadata ?? {};
    // Preserve Bluesky evidence retrieval while inference is unavailable.
    // The provider adapter still blocks inference before any outbound request.
    if (provider.cooldownUntil > now && feature !== "sentiment") throw new AnalysisError("quota", "", provider.cooldownUntil - now);
    const active = Number((await client.query("SELECT count(*) AS count FROM firstbrief_analysis_results WHERE lease_until > now()")).rows[0].count);
    if (active >= LIMITS.active) throw new AnalysisError("capacity", "");
    const scopes = [
      ["minute", "shared", 60000, LIMITS.sharedMinute], ["day", "shared", 86400000, LIMITS.sharedDay],
      ["minute", `visitor:${visitor}`, 60000, LIMITS.visitorMinute], ["hour", `visitor:${visitor}`, 3600000, LIMITS.visitorHour],
      ["minute", `ip:${ip}`, 60000, LIMITS.ipMinute], ["hour", `ip:${ip}`, 3600000, LIMITS.ipHour],
    ] as const;
    const windows = scopes.map(([period, actor, duration, limit]) => ({ key: `${period}:${actor}:${Math.floor(now / duration)}`, duration, limit }));
    const dayKey = windows[1].key;
    for (const window of windows) {
      const budget = (await client.query("SELECT count,tokens FROM firstbrief_analysis_budgets WHERE key=$1", [window.key])).rows[0];
      if ((budget?.count ?? 0) >= window.limit || (window.key === dayKey && (budget?.tokens ?? 0) + LIMITS.reserveTokens > LIMITS.dayTokens)) throw new AnalysisError("rate", "", (Math.floor(now / window.duration) + 1) * window.duration - now);
    }
    await client.query("DELETE FROM firstbrief_analysis_budgets WHERE expires_at < now()");
    await client.query(`DELETE FROM firstbrief_analysis_results WHERE (expires_at < now() OR (result IS NULL AND created_at < now()-interval '1 hour')) AND (lease_until IS NULL OR lease_until < now())`);
    for (const window of windows) {
      await client.query(`INSERT INTO firstbrief_analysis_budgets(key,count,tokens,expires_at) VALUES($1,1,$2,$3)
        ON CONFLICT(key) DO UPDATE SET count=firstbrief_analysis_budgets.count+1,tokens=firstbrief_analysis_budgets.tokens+EXCLUDED.tokens`,
        [window.key, window.key === dayKey ? LIMITS.reserveTokens : 0, new Date(now + window.duration * 2)]);
    }
    const owner = randomUUID();
    await client.query(`INSERT INTO firstbrief_analysis_results(key,feature,version,owner,lease_until) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(key) DO UPDATE SET result=NULL,expires_at=NULL,version=EXCLUDED.version,owner=EXCLUDED.owner,lease_until=EXCLUDED.lease_until,created_at=now(),failure_reason=NULL,retry_after=NULL`,
      [key, feature, ANALYSIS_VERSION, owner, new Date(now + LIMITS.leaseMs)]);
    await client.query(`DELETE FROM firstbrief_analysis_results WHERE key IN
      (SELECT key FROM firstbrief_analysis_results WHERE lease_until IS NULL OR lease_until < now() ORDER BY created_at DESC OFFSET $1)`, [LIMITS.rows - 1]);
    return { kind: "owner", owner, dayKey };
  });
}
export async function settle(feature: AnalysisFeature, key: string, admission: Extract<Admission, { kind: "owner" }>, result: unknown, failure: FailureReason | undefined, spent: number) {
  return transaction(async client => {
    let expiresAt: Date | undefined;
    if (!failure && reusable(feature, result)) {
      const now = Date.now();
      expiresAt = new Date(feature === "sentiment" ? Math.min(now, Date.parse(String(result.observedAt))) + ANALYSIS_TTLS.sentiment : now + ANALYSIS_TTLS[feature]);
      if (expiresAt.getTime() <= now) throw new AnalysisError("response", "");
    }
    const update = await client.query(`UPDATE firstbrief_analysis_results SET result=$3,expires_at=$4,owner=NULL,lease_until=NULL,failure_reason=$5,retry_after=$6
      WHERE key=$1 AND owner=$2 AND lease_until > now()`,
      [key, admission.owner, expiresAt ? result : null, expiresAt ?? null, expiresAt ? null : failure ?? "response", expiresAt ? null : new Date(Date.now() + 30000)]);
    if (!update.rowCount) throw new AnalysisError("capacity", "");
    await client.query("UPDATE firstbrief_analysis_budgets SET tokens=GREATEST(0,tokens+$2) WHERE key=$1", [admission.dayKey, Math.ceil(spent) - LIMITS.reserveTokens]);
    return expiresAt;
  });
}
export async function waitResult(feature: AnalysisFeature, key: string) {
  const deadline = Date.now() + 35000;
  while (Date.now() < deadline) {
    const row: Stored | undefined = (await query("SELECT * FROM firstbrief_analysis_results WHERE key=$1", [key])).rows[0];
    const cached = fresh(feature, row);
    if (cached) return cached;
    if (!row?.lease_until || row.lease_until.getTime() < Date.now()) throw new AnalysisError(row?.failure_reason ?? "capacity", "");
    await new Promise(done => setTimeout(done, 250));
  }
  throw new AnalysisError("timeout", "");
}
