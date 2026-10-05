import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GUARDIAN_WINDOW_MS, guardianTopics, fetchGuardianTopic, inGuardianWindow,
  relevantToTopic, selectGuardianArticles, type GuardianArticle,
} from "../src/guardian-feed";

const now = Date.parse("2026-10-05T12:00:00Z");
function article(id: string, title: string, at = now - 1000): GuardianArticle {
  return {
    id, webTitle: title, webUrl: `https://www.theguardian.com/${id}`,
    webPublicationDate: new Date(at).toISOString(),
    sectionId: "football", sectionName: "Football",
  };
}

test("rolling window includes exactly seven days, rejects older/future/invalid dates", () => {
  assert.equal(inGuardianWindow(article("boundary", "OpenAI", now - GUARDIAN_WINDOW_MS), now), true);
  assert.equal(inGuardianWindow(article("old", "OpenAI", now - GUARDIAN_WINDOW_MS - 1), now), false);
  assert.equal(inGuardianWindow(article("future", "OpenAI", now + 1), now), false);
  assert.equal(inGuardianWindow({ ...article("bad", "OpenAI"), webPublicationDate: "invalid" }, now), false);
  assert.equal(inGuardianWindow(article("now", "OpenAI", now), now), true);
});

test("topic relevance excludes incidental AI/body mentions, weapons, foreign-only football", () => {
  assert.equal(relevantToTopic({ ...article("incidental", "Football results"), fields: { body: "AI software and OpenAI were briefly mentioned." } }, "ai"), false);
  assert.equal(relevantToTopic(article("ai", "AI chatbot tools face regulation"), "ai"), true);
  assert.equal(relevantToTopic(article("ai", "OpenAI launches a new model"), "ai"), true);
  assert.equal(relevantToTopic(article("war", "Nuclear weapons tests increase"), "nuclear"), false);
  assert.equal(relevantToTopic({ ...article("war", "Iran nuclear talks resume"), fields: { trailText: "Uranium enrichment and nuclear weapons talks at a reactor site." } }, "nuclear"), false);
  assert.equal(relevantToTopic(article("energy", "New nuclear power stations approved"), "nuclear"), true);
  assert.equal(relevantToTopic({ ...article("plant", "Sizewell plans approved"), fields: { trailText: "A nuclear energy reactor will supply electricity." } }, "nuclear"), true);
  assert.equal(relevantToTopic({ ...article("smr", "SMR plans advance"), fields: { trailText: "Small modular reactors supply electricity." } }, "nuclear"), true);
  assert.equal(relevantToTopic(article("football", "Arsenal win Premier League match"), "football"), true);
  assert.equal(relevantToTopic({ ...article("tagged", "Club announces coach"), tags: [{ id: "football/bundesliga", webTitle: "Bundesliga" }] }, "football"), true);
  assert.equal(relevantToTopic(article("foreign", "Inter Miami celebrate MLS victory"), "football"), false);
  assert.equal(relevantToTopic({ ...article("foreign", "Messi signs new contract"), fields: { trailText: "Inter Miami in MLS retain the former Barcelona player." } }, "football"), false);
  assert.equal(relevantToTopic(article("foreign", "Chinese Super League results"), "football"), false);
  assert.equal(relevantToTopic({ ...article("wrong-section", "Arsenal investment"), sectionId: "business", sectionName: "Business" }, "football"), false);
});

test("newest-first, limit twelve, canonical URL and ID duplicates removed before cap", () => {
  const candidates = Array.from({ length: 15 }, (_, i) => article(`ai/${i}`, "OpenAI model news", now - i * 1000));
  const duplicates = [
    { ...candidates[0], id: "duplicate", webUrl: `${candidates[0].webUrl}/?ref=test#anchor` },
    { ...candidates[1], webUrl: "https://www.theguardian.com/another-path" },
  ];
  const result = selectGuardianArticles([...candidates.reverse(), ...duplicates], "ai", now);
  assert.equal(result.length, 12);
  assert.equal(new Set(result.map(item => item.id)).size, 12);
  assert.ok(result.every((item, i) => !i || Date.parse(result[i - 1].webPublicationDate) >= Date.parse(item.webPublicationDate)));
  assert.equal(result.at(-1)?.id, "ai/11");
});

test("empty and fallback results never extend the window", () => {
  const saved = [article("old", "Nuclear power approved", now - GUARDIAN_WINDOW_MS), article("recent", "Nuclear power approved")];
  assert.equal(selectGuardianArticles(saved, "nuclear", now).length, 2);
  assert.equal(selectGuardianArticles(saved, "nuclear", now + 1).length, 1);
  assert.equal(selectGuardianArticles(saved, "nuclear", now + GUARDIAN_WINDOW_MS).length, 0);
  assert.deepEqual(selectGuardianArticles([], "nuclear", now), []);
});

test("independent topic queries paginate past irrelevant hits without football crowding others", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { topic: string; page: number }[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    assert.equal(url.hostname, "content.guardianapis.com");
    assert.equal(url.searchParams.get("from-date"), "2026-09-28");
    assert.equal(url.searchParams.get("order-by"), "newest");
    const query = url.searchParams.get("q") ?? "";
    const topic = url.searchParams.has("section") ? "football" : query.includes("NuScale") ? "nuclear" : "ai";
    const page = Number(url.searchParams.get("page"));
    calls.push({ topic, page });
    const results = topic === "ai"
      ? page === 1 ? [article("incidental", "Unrelated story")] : [article("ai/one", "OpenAI launches model")]
      : topic === "nuclear" ? [article("nuclear/one", "Nuclear energy policy")]
      : Array.from({ length: 40 }, (_, i) => article(`football/${i}`, "Arsenal football news", now - i * 1000));
    return new Response(JSON.stringify({ response: { status: "ok", pages: topic === "ai" ? 2 : 1, results } }));
  };
  try {
    const result = await Promise.all(guardianTopics.map(topic => fetchGuardianTopic(topic, "test-only", now)));
    assert.deepEqual(result.map(items => items.length), [1, 1, 12]);
    assert.ok(calls.some(call => call.topic === "ai" && call.page === 2));
    assert.ok(calls.some(call => call.topic === "nuclear"));
    assert.ok(calls.some(call => call.topic === "football"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider failure is explicit, not reported as an empty successful topic", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    await assert.rejects(fetchGuardianTopic(guardianTopics[0], "test-only", now), /503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
