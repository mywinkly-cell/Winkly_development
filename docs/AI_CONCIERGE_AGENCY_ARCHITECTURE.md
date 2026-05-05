# AI Concierge — Agency, orchestration, and matching stack (2026)

**Last updated:** 2026-03-31

This document maps product goals (calendar white space, preference engine, reservations, proactive nudges) to **concrete Winkly code** and to **optional** third-party stacks (LangChain, Pinecone, OpenTable/Resy APIs).

---

## 1. Goals vs implementation

| Goal | Winkly implementation | Enterprise / partner APIs |
|------|------------------------|---------------------------|
| **Calendar white space** | Device: `expo-calendar` → `getMergedDeviceWhiteSpaceSlots` + `formatCalendarWhiteSpaceForGateway` → ai-gateway `calendar_white_space`. | Google Calendar: `calendar_connections` + Edge `calendar-freebusy` (stub → FreeBusy). iCal: file import or CalDAV (roadmap). |
| **Preference engine** | DB: `user_concierge_signals` (JSONB: `avoid`, `prefer`, `noise_level`, `professional_topics`). Gateway merges with `profiles_mode` + `mergePreferenceEngineNarrative`. Client: `lib/ai/preferenceEngine.ts`. | ML personalization: optional batch job on feedback (future). |
| **Reservations** | `lib/integrations/bookingLinks.ts` builds **discovery** URLs (OpenTable search, Resy city). ai-gateway `booking_context` — model must **not** claim confirmed bookings. | OpenTable Guest Center / Resy API partner programs for programmatic hold/book; legal + PCI scope. |
| **Icebreaker / stale DM nudge** | RPC `conversation_eligible_for_concierge_nudge` + `dismiss_concierge_nudge`. Friends/Business DMs stale **48h**. UI: chat banner → Concierge with prefill. | Push notifications via existing notification pipeline (future). |

---

## 2. LLM orchestrator (GPT-4o / Claude vs current stack)

- **Today:** Supabase Edge **`ai-gateway`** (Deno) calls **Gemini** and/or **OpenAI** with **hand-rolled tool loops** (`get_weather`, `get_winkly_events`, `get_planner_items`). No LangChain in production — smaller cold start, fewer deps, full control over allowlists.
- **LangChain / LangGraph role:** Use if you add **many** tools (CRM, Slack, multi-step booking) or **agent** graphs. Reasonable deployment: **Node** worker (Cloud Run / Fly) with LangGraph calling the same Supabase RPCs — **not** inside Edge unless bundled carefully.
- **Recommendation:** Keep Edge gateway for PII-safe, allowlisted paths; add a **optional** `ai-agent-worker` service with LangChain only when tool count and branching justify operational cost.

---

## 3. Action layer (LangChain vs native tools)

- **Native (current):** Tools are plain async functions in `ai-gateway/index.ts`; context is allowlisted JSON.
- **LangChain:** `StructuredTool` wrappers around the same functions; adds tracing (LangSmith) and retry policies — adopt when debugging multi-tool failures at scale.

---

## 4. Matching engine: Pinecone vs Postgres pgvector

- **Already in DB:** `profile_embeddings` with **pgvector** (`vector(384)`) and `compatibility_scores` (see `20250315110000_compatibility_architecture.sql`). Edge `recompute-compatibility` fills scores.
- **Pinecone:** Useful for **multi-tenant SaaS** scale, hybrid search, or **non-Postgres** ML pipelines. For Winkly-first data, **pgvector** keeps RLS, joins, and fewer moving parts.
- **When to add Pinecone:** If embedding dimension changes often, or you need **separate** vector index per region with sub-ms p99 at huge QPS.

---

## 5. OpenTable / Resy

- **Discovery (implemented):** URL templates in `bookingLinks.ts`; passed as `booking_context` so the LLM cites “search on OpenTable” instead of inventing bookings.
- **True booking:** Requires partner onboarding; typically **server-side** holds with user OAuth to OpenTable/Resy where supported. Store **booking intent** in `planner_items.meta` with `external_booking_ref` when available.

---

## 6. Files reference

| Area | Path |
|------|------|
| Gateway merge / prompts | `supabase/functions/ai-gateway/index.ts` |
| Signals + nudge RPCs | `supabase/migrations/20260407120000_concierge_agency_signals_nudges.sql` |
| Calendar stub | `supabase/functions/calendar-freebusy/index.ts` |
| Client prefs | `apps/mobile/lib/ai/preferenceEngine.ts` |
| Calendar merge | `apps/mobile/lib/integrations/calendarWhiteSpace.ts` |
| Booking URLs | `apps/mobile/lib/integrations/bookingLinks.ts` |
| Stale nudge API | `apps/mobile/lib/chats/conciergeNudge.ts` |
| Concierge context | `apps/mobile/lib/ai/conciergeClient.ts` |

---

## 7. Security

- **Tokens:** `calendar_connections.token_encrypted` must use KMS or pgcrypto before production Google sync.
- **Allowlist:** Only documented keys reach the LLM; chat content is not sent for concierge by default.
