import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import express from "express";
import { pool } from "@workspace/db";
import { ANALYSIS_VERSION } from "@workspace/api-zod";
import { admit, readResult, reusable, requestIdentity, settle, waitResult, LIMITS, saveProviderState } from "../src/analysis-store";
import { sharedAnalysis } from "../src/analysis-middleware";
import { AnalysisError } from "../src/analysis-policy";
import { runPipeline } from "../src/routes/sentiment";
import { analysisContext } from "../src/analysis-context";
const schema = `fb_test_${randomUUID().replaceAll("-", "")}`;
const feature = "why-it-matters" as const;
const payload = { articleId: "fixture", url: "https://www.theguardian.com/test-fixture", headline: "SIMULATED fixture", summary: "Test source", body: "Test body" };
const key = requestIdentity(feature, payload)!;
const output = { whyItMatters: "Simulated analysis.\n\nOnly for isolated tests.", sourceNote: "Simulated bounded source." };
before(async () => {
  await pool.query(`CREATE SCHEMA ${schema}`);
  await pool.query(`CREATE TABLE ${schema}.firstbrief_analysis_results (LIKE public.firstbrief_analysis_results INCLUDING ALL)`);
  await pool.query(`CREATE TABLE ${schema}.firstbrief_analysis_budgets (LIKE public.firstbrief_analysis_budgets INCLUDING ALL)`);
  pool.on("connect", client => { void client.query(`SET search_path TO ${schema}`); });
  await pool.query(`SET search_path TO ${schema}`);
});
after(async () => {
  await pool.query(`DROP SCHEMA ${schema} CASCADE`);
  await pool.end();
});
async function reset() {
  await pool.query("TRUNCATE firstbrief_analysis_results, firstbrief_analysis_budgets");
}
async function owned(k = key, f = feature) {
  const result = await admit(f, k, "visitor-fixture", "ip-fixture");
  assert.equal(result.kind, "owner");
  if (result.kind !== "owner") throw new Error("Not owner");
  return result;
}
test("real PostgreSQL: successful result survives a fresh Node process; content and expiry isolation", async () => {
  await reset();
  const owner = await owned();
  await settle(feature, key, owner, output, undefined, 100);
  assert.equal((await readResult(feature, key))?.result.whyItMatters, output.whyItMatters);
  const child = spawnSync(process.execPath, [path.join(path.dirname(process.argv[1]), "analysis-store-reader.mjs"), schema, feature, key], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).result.whyItMatters, output.whyItMatters);
  assert.notEqual(requestIdentity(feature, { ...payload, body: "changed body" }), key);
  assert.notEqual(requestIdentity(feature, { ...payload, url: "https://www.theguardian.com/another" }), key);
  assert.equal(await readResult(feature, requestIdentity(feature, { ...payload, summary: "changed excerpt" })!), null);
  await pool.query("UPDATE firstbrief_analysis_results SET version='obsolete'");
  assert.equal(await readResult(feature, key), null);
  await pool.query("UPDATE firstbrief_analysis_results SET version=$1,expires_at=now()-interval '1 second'", [ANALYSIS_VERSION]);
  assert.equal(await readResult(feature, key), null);
});
test("simultaneous cold requests have one owner, bounded followers reuse it, other work is busy", async () => {
  await reset();
  const requests = await Promise.all(Array.from({ length: 5 }, () => admit(feature, key, "visitor-fixture", "ip-fixture")));
  assert.equal(requests.filter(value => value.kind === "owner").length, 1);
  assert.equal(requests.filter(value => value.kind === "wait").length, 4);
  await assert.rejects(() => admit(feature, "different", "another", "another"), (error: unknown) => error instanceof AnalysisError && error.reason === "capacity");
  const owner = requests.find(value => value.kind === "owner")!;
  if (owner.kind !== "owner") throw new Error("Not owner");
  const follower = waitResult(feature, key);
  await settle(feature, key, owner, output, undefined, 100);
  assert.equal((await follower).result.whyItMatters, output.whyItMatters);
  assert.equal(Number((await pool.query("SELECT count FROM firstbrief_analysis_budgets WHERE key=$1", [owner.dayKey])).rows[0].count), 1);
});
test("matching Bluesky evidence, sample and original observation survive; partial/failure/malformed cannot succeed", async () => {
  await reset();
  const snapshot = { status: "qualitative", summary: "Simulated sampled reactions.", themes: ["Simulated theme"], postCount: 5, source: "Bluesky", observedAt: new Date(Date.now() - 600000).toISOString(), evidence: Array.from({ length: 5 }, (_, i) => ({ url: `https://bsky.app/profile/did:plc:test/post/test${i}`, author: "fixture", text: "Simulated post.", match: "ai_verified" })), sourceNote: "Simulated sample: five." };
  const owner = await admit("sentiment", "sentiment-fixture", "visitor", "ip");
  if (owner.kind !== "owner") throw new Error("Not owner");
  const expiry = await settle("sentiment", "sentiment-fixture", owner, snapshot, undefined, 100);
  assert.equal(expiry!.getTime(), Date.parse(snapshot.observedAt) + 45 * 60000);
  assert.deepEqual((await readResult("sentiment", "sentiment-fixture"))?.result, snapshot);
  for (const bad of [{}, { ...snapshot, retrievalPartial: true }, { ...snapshot, evidence: [] }, { ...snapshot, status: "analysis_unavailable" }, { ...snapshot, summary: "" }]) assert.equal(reusable("sentiment", bad), false);
  assert.equal(reusable(feature, { whyItMatters: "" }), false);
  const badOwner = await owned("bad");
  await settle(feature, "bad", badOwner, { whyItMatters: "" }, "response", 0);
  assert.equal(await readResult(feature, "bad"), null);
  await pool.query("UPDATE firstbrief_analysis_results SET result=jsonb_set(result,'{observedAt}',to_jsonb((now()-interval '46 minutes')::text)) WHERE key='sentiment-fixture'");
  assert.equal(await readResult("sentiment", "sentiment-fixture"), null);
});
test("persistent visitor/shared budgets and token reservations reject bursts but cached reads stay available", async () => {
  await reset();
  const owner = await owned();
  await settle(feature, key, owner, output, undefined, 123);
  const minute = Math.floor(Date.now() / 60000);
  const hour = Math.floor(Date.now() / 3600000);
  for (const [budgetKey, count] of [[`minute:visitor:visitor-fixture:${minute}`, 3], [`hour:visitor:visitor-fixture:${hour}`, 12], [`minute:shared:${minute}`, 6], [owner.dayKey, 60]] as const) {
    await pool.query("UPDATE firstbrief_analysis_budgets SET count=$2 WHERE key=$1", [budgetKey, count]);
    await assert.rejects(() => admit(feature, "uncached", "visitor-fixture", "ip-fixture"), (error: unknown) => error instanceof AnalysisError && error.reason === "rate" && !!error.retryAfterMs);
    assert.equal((await admit(feature, key, "visitor-fixture", "ip-fixture")).kind, "cached");
    await pool.query("UPDATE firstbrief_analysis_budgets SET count=1 WHERE key=$1", [budgetKey]);
  }
  assert.equal((await pool.query("SELECT tokens FROM firstbrief_analysis_budgets WHERE key=$1", [owner.dayKey])).rows[0].tokens, 123);
  await pool.query("UPDATE firstbrief_analysis_budgets SET tokens=$2 WHERE key=$1", [owner.dayKey, LIMITS.dayTokens - LIMITS.reserveTokens + 1]);
  await assert.rejects(() => owned("new"), (error: unknown) => error instanceof AnalysisError && error.reason === "rate");
  assert.ok(await readResult(feature, key));
});
test("direct uppercase HTTP requests are protected; duplicate visitors share once; storage outage spends zero work", async () => {
  await reset();
  const app = express();
  app.use(express.json());
  app.use("/api", sharedAnalysis);
  let work = 0;
  app.post("/api/why-it-matters", async (_req, res) => { work++; await new Promise(done => setTimeout(done, 80)); res.json(output); });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(done => server.on("listening", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  const url = `http://127.0.0.1:${address.port}/api/WHY-IT-MATTERS`;
  try {
    const post = () => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const responses = await Promise.all([post(), post(), post()]);
    const bodies = await Promise.all(responses.map(response => response.json()));
    assert.equal(work, 1);
    assert.equal(bodies.filter(body => body.cached === true).length, 2);
    const freshBrowser = await (await post()).json();
    assert.equal(freshBrowser.cached, true);
    assert.equal(work, 1);
    await pool.query("ALTER TABLE firstbrief_analysis_results RENAME TO unavailable_fixture");
    const unavailable = await post();
    assert.equal(unavailable.status, 503);
    assert.equal((await unavailable.json()).reason, "storage");
    assert.equal(work, 1);
    await pool.query("ALTER TABLE unavailable_fixture RENAME TO firstbrief_analysis_results");
    assert.equal((await (await post()).json()).cached, true);
    assert.equal(work, 1);
  } finally { await new Promise<void>(done => server.close(() => done())); }
});
test("provider-reported cooldown blocks new admissions, not stored successes; pruning enforces row bound", async () => {
  await reset();
  const owner = await owned();
  await settle(feature, key, owner, output, undefined, 100);
  await saveProviderState({ cooldownUntil: Date.now() + 30000 });
  await assert.rejects(() => owned("other"), (error: unknown) => error instanceof AnalysisError && error.reason === "quota");
  assert.equal((await admit(feature, key, "fresh", "fresh")).kind, "cached");
  await saveProviderState({ cooldownUntil: Date.now() - 1 });
  await pool.query(`INSERT INTO firstbrief_analysis_results(key,feature,version,result,expires_at)
    SELECT 'bounded-fixture-'||i,'why-it-matters',$1,$2,now()+interval '1 day' FROM generate_series(1,1000) i`, [ANALYSIS_VERSION, output]);
  await owned("bounded-new");
  assert.equal(Number((await pool.query("SELECT count(*) AS count FROM firstbrief_analysis_results")).rows[0].count), LIMITS.rows);
});
test("shared quota cooldown retains retrieved Bluesky evidence with zero outbound inference", async () => {
  await reset();
  await saveProviderState({ cooldownUntil: Date.now() + 30000 });
  const admitted = await admit("sentiment", "quota-evidence", "visitor", "ip");
  assert.equal(admitted.kind, "owner");
  const savedFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async input => {
    const url = String(input);
    if (!url.startsWith("https://api.bsky.app/")) { calls++; throw new Error("Forbidden inference"); }
    return new Response(JSON.stringify({ posts: Array.from({ length: 5 }, (_, i) => ({
      uri: `at://did:plc:fixture${i}/app.bsky.feed.post/test${i}`,
      author: { did: `did:plc:fixture${i}`, handle: `fixture${i}.bsky.social` },
      record: { $type: "app.bsky.feed.post", text: `Simulated reaction ${i}: OpenAI test model rules need safeguards ${payload.url}`, createdAt: new Date().toISOString() },
    })) }));
  };
  try {
    const context = { sent: false };
    const result = await analysisContext.run(context, () => runPipeline("test-only-placeholder", "OpenAI test model rules", "", "ai", payload.url));
    assert.equal(result.status, "analysis_unavailable");
    if (result.status === "analysis_unavailable") assert.equal(result.reason, "quota");
    assert.equal(result.evidence?.length, 5);
    assert.equal(calls, 0);
    assert.equal(context.sent, false);
  } finally { globalThis.fetch = savedFetch; }
});
