# AI Concierge — Recommendation & Implementation Guide

**Last updated:** 2026-02-16

This document recommends an AI agent/service for Winkly’s concierge experience: planning, events, weather-aware suggestions, match/chat assistance, and trip coordination. It covers business and technical fit, provider choice, and implementation.

---

## 1. Does this complement and enhance Winkly?

**Yes.** It aligns with your product and differentiates the app.

### Business fit

- **Concierge = premium feel** — Planning, weather checks, and “we’ve thought of it” suggestions support the “5-star hotel” experience and justify premium.
- **Winkly-first is already in the vision** — Your product doc and `PRODUCT_VISION_AI_AND_MODES.md` state that AI should prioritize Winkly events and business offers; an agent that queries Winkly data first and only then suggests external options fits that rule.
- **Reduces friction** — Skiing example: instead of each person searching, comparing, and checking weather, one flow (e.g. “We’re thinking skiing next week”) can return a shortlist of options (Winkly events first), weather, and practical next steps.
- **Stickiness** — Planning and coordination inside the app increase usage and make Winkly the place where “we decide and plan,” not just chat.

### Technical fit

- **Existing foundation** — You already have:
  - `ai-gateway` Edge Function (auth, mode, task, telemetry in `ai_requests`).
  - Client heuristics in `lib/ai/romanceInsights.ts` and `friendsInsights.ts` (compatibility, tags, starters).
  - Planner, events, and profiles in Supabase with RLS.
- **Safe rollout** — AI can be additive: keep current heuristics, and use the gateway for richer tasks (plan, concierge, chat_suggest) with allowlisted context only.
- **No PII in telemetry** — `ai_requests` stays `user_id`, `mode`, `task`; no raw chat or PII in logs.

---

## 2. Recommended solution: LLM + tools in the existing gateway

Use a **single LLM provider with function/tool calling** inside your existing `ai-gateway` Edge Function. The model decides when to call tools (weather, Winkly events, planner) and returns structured suggestions.

### Why this architecture

- **One place for safety and cost** — All LLM and tool calls go through the gateway; API keys stay in Supabase secrets; you enforce mode and allowlisted context in one place.
- **Winkly-first in code** — Tools explicitly query `events` and `planner_items` first; the system prompt instructs “suggest Winkly events and businesses first; use external only when needed.”
- **Extensible** — Add tools over time: weather, Winkly events, planner, then (optionally) places, routes, rates.

---

## 3. Provider recommendation

| Provider | Pros | Cons | Best for |
|----------|------|------|----------|
| **OpenAI (GPT-4o)** | Strong tool use, widely used in serverless, predictable API | Separate keys for weather/maps unless you add Google | First implementation; chat and planning |
| **Google (Gemini 2.x)** | Native fit with Google Weather API, Maps, Places | Tied to Google stack | If you standardize on Google for weather/maps |
| **Anthropic (Claude)** | Strong reasoning, good tool use | Similar to OpenAI for external APIs | If you prefer Claude for quality/safety |

**Recommendation:** Start with **OpenAI GPT-4o** in the Edge Function:

1. Reliable tool-calling and good for multi-step planning.
2. Easy to run from Deno (REST API).
3. Weather can be **Open-Meteo** (free, no key) for MVP; later add Google Weather API or keep Open-Meteo.
4. You can swap to Gemini later if you want tighter Google Weather/Maps/Places integration.

**Alternative:** If you prefer to standardize on Google (Maps, Weather, Places) from day one, use **Gemini** and Google Weather API; the same gateway pattern (auth → validate task → call LLM with tools → execute tools) applies.

---

## 4. Suggested tools (in the gateway)

Implement these inside `ai-gateway` so the LLM can act as concierge:

| Tool | Purpose | Data source | Notes |
|------|---------|-------------|--------|
| **get_weather** | Forecast at event/user location; suggest postpone or move indoors | Open-Meteo (MVP) or Google Weather API | Lat/lng or city; date optional |
| **get_winkly_events** | Suggest Winkly events first (aligns with product rule) | Supabase `events` (service role) | Filter by mode, date range, location hint |
| **get_planner_items** | Avoid double-booking; “your week” context | Supabase `planner_items` | For authenticated user only |
| **suggest_places** (optional) | External venues for dates/meetups/skiing | Stub → later Google Places / partner API | Return Winkly businesses first if in DB |

For “suggest next message” or “best matches,” the gateway already has tasks `rank` / `suggest`; the LLM can use **allowlisted profile fields** (interests, city, mode) and optional **short intent** (e.g. “planning skiing trip”) without sending full chat history.

---

## 5. High-level flow (concierge example)

1. User (or chat) asks for help: “We want to go skiing next week, somewhere within 2h.”
2. App sends to `ai-gateway`: task `concierge` or `plan`, mode, allowlisted context (e.g. `city`, `date_from`, `date_to`, `activity_hint: "skiing"`, `budget_tier`).
3. Gateway validates auth and mode, logs to `ai_requests`, calls LLM with system prompt (Winkly-first, concierge tone) and tool definitions.
4. LLM may call: `get_winkly_events(mode=events, activity=skiing, ...)` → then `get_weather(lat, lng, date)` for each option.
5. LLM returns a short summary and structured suggestions (e.g. “Option A: Winkly event X, weather clear; Option B: external resort Y”).
6. App shows suggestions; user can open maps, add to planner, or reschedule from the same flow.

Same pattern for: “Should we move our picnic?” (weather at location + time), “Best date ideas in [city]” (Winkly events + optional places), and “Suggest next message” (allowlisted profile + intent only).

---

## 6. Implementation status and next steps

- **Done in this change set**
  - Recommendation (this doc).
  - `ai-gateway` extended with optional **OpenAI** call and tools: `get_weather` (Open-Meteo), `get_winkly_events`, `get_planner_items`.
  - New tasks: `plan`, `concierge`, `event_suggest` (plus existing `rank`, `suggest`, `summarize`).
  - Mobile client helper to call the gateway for concierge/plan (see `lib/ai/conciergeClient.ts`).
- **Next steps**
  - Set `OPENAI_API_KEY` in Supabase Edge Function secrets to enable real LLM + tools.
  - Optionally add Google Weather API (or keep Open-Meteo).
  - Add `suggest_places` (Winkly businesses first, then Google Places or partner).
  - Wire Planner/Events UI to “Ask AI” or “Suggest” that uses the new client.
  - For chat: add `chat_suggest` task with allowlisted context only (e.g. last message summary + profile fields).

---

## 7. Security and compliance (unchanged)

- **No PII in telemetry** — `ai_requests` remains `user_id`, `mode`, `task`.
- **Allowlisted context only** — Gateway accepts only structured, allowlisted fields (mode, city, date range, activity_hint, budget_tier); no raw chat unless you explicitly allow a short summary and document it.
- **API keys** — Only in Supabase secrets; never in the client.
- **RLS** — Tool code uses service role only to fetch data the user is allowed to see (e.g. their planner, events they can access); no bypass of RLS for end-user visibility.

---

*This recommendation is the single reference for why and how to run the AI concierge in Winkly. Update it when you add providers, tools, or new tasks.*
