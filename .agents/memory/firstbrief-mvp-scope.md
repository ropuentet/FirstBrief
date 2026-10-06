---
name: FirstBrief MVP constraints
description: Durable news/AI scope rules, provider verification constraints, and relevant environment quirks.
---

## News integrity

Keep genuine publisher headlines, provided text, dates, attribution, and original links. Do not force irrelevant articles into AI, Energy or European football or imply separate articles cover the same event without evidence. Rundown must stay faithful to publisher text; excerpts must not be presented as full-article access.

**Why:** The user requires a usable news MVP, not mock reporting or invented source summaries.

**How to apply:** Source expansion must establish live availability and permitted reuse first; a failed source must not break working news.

## Feed coverage boundaries

Use a rolling past seven days with up to 12 genuinely relevant articles per independently populated topic. Topic tabs are newest-first. All combines articles without duplicates using approximate editorial significance/freshness and prominent topic balance, not purely timestamp order. Sparse coverage must remain sparse, not expand into unrelated subjects or older dates.

**Why:** The user explicitly requires football volume not to crowd out AI or Energy coverage or the opening newspaper selection, and shortages must not be hidden by invented or out-of-window reporting.

**How to apply:** Reapply the date boundary to retained outage results as well as fresh results. Energy replaces the nuclear-only topic and includes nuclear/SMRs, renewables, storage, electricity grids, utilities, and major energy policy/investment/industry; it must be central to the story. No subtopic controls. Body-only AI mentions, unrelated climate/politics and weapons-only nuclear stories do not establish relevance.

## On-demand analysis and quota handling

Ordinary homepage/story browsing must not generate AI. Why It Matters, Public Sentiment, and article outlines require explicit activation. Reuse applies only to the same article and unchanged supplied text; a URL alone is not sufficient proof that an old analysis still applies.

**Why:** Provider evidence has established a daily limit in past failures, but generic UI failures alone cannot establish quota. Changed content or another article must never inherit an unrelated analysis.

**How to apply:** Preserve valid successes; prevent duplicate clicks and automatic failure retries, but allow explicit retry without treating failures as successes. Finish loading within a bound. Report quota only with provider evidence; distinguish input, retrieval, timeout, configuration and response failures. Do not invent reset times or add a paid/provider fallback.

## Public Sentiment evidence

Public Sentiment means sampled Bluesky reactions, never representative public opinion or article tone. Preserve actual supporting post links and sample size even if downstream analysis fails; distinguish too few matching posts from retrieval failure.

**Why:** The user explicitly requires existing Bluesky evidence, not invented reactions or a new social analytics product.

**How to apply:** Treat broad keyword matches as candidates unless confirmed relevant. Keep source evidence readable independently of AI availability.

## Anonymous shared beta

Successful-result reuse across visitors should not require accounts or login for the small beta. Preserve the working analysis outputs when improving quota protection; cache reliability is not permission to change editorial quality or expand features.

**Why:** The user requested shared reuse to conserve the existing free Groq allowance, explicitly said no accounts/login feature was needed, and separated caching/protection work from factual-grounding changes.

**How to apply:** Treat anonymous visitor/IP controls as best-effort, not proof of identity or unlimited abuse protection. Explain practical shared limits and distinguish development durability evidence from published-environment verification.

## Verification

Use simulated AI responses by default for browser verification. When the user explicitly authorizes live validation, enforce their attempt ceiling before navigation and stop immediately on a confirmed quota/auth blocker.

**Why:** A previous raw-browser interception pattern failed to match the AI endpoints and consumed actual allowance. Live generation must stop on a confirmed quota/auth blocker.

**How to apply:** Install fail-closed routing before navigation, count generation requests, and distinguish simulated outcomes from live provider evidence. Use a genuinely empty browser context for fresh-visitor checks; do not clear localStorage in a per-document init script when verifying reload persistence.

**Verification lesson:** A storage-clearing init script runs again on reload and can falsely suggest that successful browser caching failed. Inspect the harness and source signature before spending another provider request.

## Provider cost and source limits

The Groq migration must remain compatible with the existing free-plan setup. Do not activate billing, upgrade plans, use Replit-billed AI integrations, or fall back automatically to Gemini or another provider. Leave existing secrets intact.

**Why:** The user requested a focused provider migration to unblock the MVP, not paid services or a feature expansion.

**How to apply:** A provider change must preserve valid article-specific successes while discarding the previous provider's failure/cooldown assumptions. Bound inputs and outputs, disclose excerpting and limited social samples, and present final responses only. Use actual provider evidence for rate limits; Groq's request-budget headers concern daily requests while its token-budget headers concern tokens per minute.

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

**Why:** These are established project design constraints; the user confirmed liking the seven-day newspaper appearance. Reliability work is not a redesign.

**How to apply:** Reuse existing controls and layout for essential behavior changes.
