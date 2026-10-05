---
name: FirstBrief MVP constraints
description: Durable news/AI scope rules, provider verification constraints, and relevant environment quirks.
---

## News integrity

Keep genuine publisher headlines, provided text, dates, attribution, and original links. Do not force irrelevant articles into nuclear or European football or imply separate articles cover the same event without evidence.

**Why:** The user requires a usable news MVP, not mock reporting or invented source summaries.

**How to apply:** Source expansion must establish live availability and permitted reuse first; a failed source must not break working news.

## Feed coverage boundaries

Use a rolling past seven days with up to 12 genuinely relevant articles per independently populated topic. All combines those articles without duplicates, newest first. Sparse coverage must remain sparse, not expand into unrelated subjects or older dates.

**Why:** The user explicitly requires football volume not to crowd out AI or nuclear coverage, and shortages must not be hidden by invented or out-of-window reporting.

**How to apply:** Reapply the date boundary to retained outage results as well as fresh results. Treat a topic fetch failure differently from a successful search with no matching articles. Body-only AI mentions and weapons-only nuclear stories do not establish relevance.

## On-demand analysis and quota handling

Ordinary homepage/story browsing must not generate AI. Why It Matters, Public Sentiment, and article outlines require explicit activation. Reuse applies only to the same article and unchanged supplied text; a URL alone is not sufficient proof that an old analysis still applies.

**Why:** Automatic generation exhausted the existing Gemini allowance, including a reported daily limit. Changed content or another article must never inherit an unrelated analysis.

**How to apply:** Preserve valid successes; suppress duplicate and failed attempts; finish loading within a bound. Do not invent analysis, sentiment, or quota reset times. Do not queue work waiting for quota resets or add a paid/provider fallback.

## Verification

Use simulated AI responses for browser verification. Do not retry live quota failures.

**Why:** A previous raw-browser interception pattern failed to match the AI endpoints and consumed actual allowance. Provider evidence already established quota exhaustion.

**How to apply:** Install fail-closed routing before navigation, count generation requests, and distinguish simulated outcomes from live provider evidence.

## Market Context

Market Context is explicitly parked.

**Why:** The user excluded this from essential MVP work.

**How to apply:** Do not reconnect or expand its UI, test its providers, or introduce requests while working on news/analysis.

## Bluesky environment quirk

Use api.bsky.app rather than public.api.bsky.app; the latter was Cloudflare-blocked from this environment. Avoid a lang=en query filter because valid English posts may have no language metadata.

**Why:** Earlier live checks observed access failure on the public host and valid unauthenticated responses on api.bsky.app.

**How to apply:** Verify current code/behavior before changing host assumptions; do not substitute an empty discussion for an access failure.

## Visual constraints

Preserve the existing monochrome layout, square corners, whole-pixel font sizes, and outlined focus tabs.

**Why:** These are established project design constraints; reliability work is not a redesign.

**How to apply:** Reuse existing controls and layout for essential behavior changes.
