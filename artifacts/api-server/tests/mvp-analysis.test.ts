import assert from "node:assert/strict";
import { test } from "node:test";
import { getBlueskyDiscussion, runPipeline } from "../src/routes/sentiment";
import { analysisFailure, AnalysisError, analysisKey, analysisFailedRecently, recordAnalysisFailure, clearAnalysisFailure } from "../src/analysis-policy";

const url = "https://www.theguardian.com/technology/test-article";
const headline = "OpenAI launches new chatbot model";
function post(index: number) {
  return { uri: `at://did:plc:example/app.bsky.feed.post/test${index}`, author: { did: "did:plc:example", handle: "sample.test" },
    record: { $type: "app.bsky.feed.post", text: `${url} OpenAI chatbot model reaction ${index}`, createdAt: new Date().toISOString() } };
}
async function withSource(count: number, action: () => Promise<void>, completion?: (body: Record<string, unknown>) => Response) {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    if (new URL(String(input)).hostname === "api.groq.com") {
      assert.ok(completion, "Unexpected generation call");
      return completion!(JSON.parse(String(options?.body)));
    }
    assert.equal(new URL(String(input)).hostname, "api.bsky.app");
    return new Response(JSON.stringify(String(input).includes("getPostThread") ? { thread: {} } :
      { posts: [...Array.from({ length: count }, (_, i) => post(i)), { ...post(100), record: { $type: "app.bsky.feed.post", text: "OpenAI unrelated news", createdAt: new Date().toISOString() } }] }));
  };
  try { await action(); } finally { globalThis.fetch = original; }
}

test("error reasons preserve evidence and explicit retry can clear only its own failure", () => {
  assert.equal(analysisFailure(new Error("429 limit: 20 requests per day")).reason, "quota");
  assert.equal(analysisFailure(new Error("401 unauthorized")).reason, "auth");
  assert.equal(analysisFailure(new Error("request timed out")).reason, "timeout");
  assert.equal(analysisFailure(new Error("generic unavailable")).reason, "provider");
  const key = analysisKey("test", url, [headline]);
  const other = analysisKey("test", url, ["changed headline"]);
  recordAnalysisFailure(key, new AnalysisError("timeout", ""));
  assert.equal(analysisFailedRecently(key), true);
  assert.equal(analysisFailedRecently(other), false);
  clearAnalysisFailure(key);
  assert.equal(analysisFailedRecently(key), false);
});
test("Bluesky direct article evidence is deduplicated and unrelated broad matches excluded", async () => {
  await withSource(5, async () => {
    const result = await getBlueskyDiscussion(headline, "Publisher text", "ai", url);
    assert.equal(result.posts.length, 5);
    assert.equal(result.evidence.length, 5);
    assert.ok(result.evidence.every(item => item.match === "article_link" && item.url.startsWith("https://bsky.app/profile/")));
  });
});
test("too few posts returns insufficient, not invented reactions or an AI call", async () => {
  await withSource(1, async () => {
    const result = await runPipeline(undefined, headline, "", "ai", url);
    assert.equal(result.status, "insufficient");
    assert.equal(result.postCount, 1);
    assert.equal(result.evidence?.length, 1);
  });
});
test("source retrieval failure is distinct from no discussion", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 503 });
  try {
    const result = await runPipeline(undefined, headline, "", "ai", url);
    assert.equal(result.status, "retrieval_failed");
  } finally { globalThis.fetch = original; }
});
test("analysis/auth unavailability retains source links and sample, not a successful analysis", async () => {
  await withSource(5, async () => {
    const result = await runPipeline(undefined, headline, "", "ai", url);
    assert.equal(result.status, "analysis_unavailable");
    assert.equal(result.postCount, 5);
    assert.equal(result.evidence?.length, 5);
    assert.equal("summary" in result, false);
  });
});
test("simulated successful AI analysis uses only verified post indices", async () => {
  let calls = 0;
  await withSource(5, async () => {
    const result = await runPipeline("test-only-placeholder", headline, "", "ai", url);
    assert.equal(calls, 1);
    assert.equal(result.status, "qualitative");
    assert.ok(result.evidence?.every(item => item.match === "ai_verified"));
    assert.ok(result.sourceNote?.includes("5 of 5"));
  }, body => {
    calls++;
    assert.equal(body.model, "openai/gpt-oss-20b");
    assert.equal(body.include_reasoning, false);
    assert.equal(body.max_completion_tokens, 1200);
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ tier: "qualitative", relevant_indices: [0, 1, 2, 3, 4], summary: "Simulated sampled reactions.", themes: ["Simulated theme"] }) } }] }));
  });
});
test("malformed sentiment JSON is an analysis failure, not insufficient Bluesky evidence", async () => {
  await withSource(5, async () => {
    const result = await runPipeline("test-only-placeholder", headline, "", "ai", url);
    assert.equal(result.status, "analysis_unavailable");
    assert.equal("reason" in result && result.reason, "response");
    assert.equal(result.postCount, 5);
    assert.equal(result.evidence?.length, 5);
  }, () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "{}" } }] })));
});
