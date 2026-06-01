# Subscription Tiers & AI Access

**Last updated:** 2026-06-01

This document defines Winkly subscription tiers (Free, Super, Premium), how AI is gated per tier, the **Winkly AI Spark** icon behaviour, and what you need to do to activate the AI agent.

---

## 1. Tier definitions (business view)

| Tier | Who it's for | What they get |
|------|--------------|----------------|
| **Free (Basic)** | Users who want core Winkly without paying | All core product: modes (Romance/Friends/Business/Events), connect with people, 1:1 and group chat, search, events (discover, participate, create, host), Planner with contacts/calendar/maps. Basic ranking and relevant content only — similar to what other apps offer for free. **No AI suggestions, no concierge.** |
| **Super** | Users who want smarter discovery and light AI help | Everything in Free, plus **limited AI**: Smart AI matching (profile-based), better event suggestions, mid-level planning support (activity/place ideas from interests, location, preferences, wishlist), and support with the opening move in chats. **Not** the full concierge (no weather-aware rescheduling, full trip planning, or “do it for me” coordination). |
| **Premium** | Users who want the full “5-star” experience | Everything in Super, plus **full AI and concierge**: full concierge service (weather checks, postpone/indoor suggestions, trip planning, routes, coordination), and full AI matching/suggestions everywhere the Spark appears. |

**Enterprise** (future): For business accounts or teams; can map to Premium-level AI or custom limits.

---

## 2. Tier definitions (technical / feature gates)

| Feature | Free | Super | Premium |
|--------|------|-------|---------|
| Modes, chat, events, planner, contacts, calendar, maps | ✅ | ✅ | ✅ |
| Basic ranking / relevant feed (non-AI) | ✅ | ✅ | ✅ |
| **Smart AI matching** (profile analysis, better match order) | ❌ | ✅ | ✅ |
| **Better event suggestions** (AI) | ❌ | ✅ | ✅ |
| **Planning ideas** (activities/places from interests, location, wishlist) | ❌ | ✅ | ✅ |
| **Chat opener suggestion** (first message / icebreaker) | ❌ | ✅ | ✅ |
| **Full concierge** (weather, reschedule suggestions, trip planning, routes) | ❌ | ❌ | ✅ |
| **All Spark entry points** active (not greyed out) | ❌ | Limited* | ✅ |

\* Super: Spark is active where “limited AI” applies (matching, event suggestions, planning ideas, chat opener). Spark is greyed out where only “full concierge” applies (e.g. “Plan this trip for me” in chat).

---

## 3. Winkly AI Spark icon

- **What it is:** A single, consistent **magic Spark** icon (e.g. sparkles ✨) used everywhere the user can invoke Winkly AI.
- **Where it appears:** Discover (match order), Filters (AI matching toggle), Events (suggestions), Planner (suggest ideas / concierge), Chats (opener suggestion, and in-conversation concierge for Premium).
- **Behaviour:**
  - **Subscribed (Super or Premium)** with access to that feature: Spark is **on** (coloured, e.g. brand violet or accent). Tap → use the AI feature.
  - **Free, or Super on a Premium-only feature:** Spark is **greyed out** (same icon, disabled style). Tap → show an **upsell message**: explain what Winkly AI can do here, and encourage upgrade with a **relevant tariff** (Super for “smarter matches & ideas”, Premium for “full concierge & planning”).
- **Copy for upsell:** Short, benefit-led; include CTA “See plans” → `/account/subscription` (and optionally deep-link Super vs Premium).

---

## 4. What to do to activate the AI agent

1. **Backend (Supabase)**  
   - Set **Edge Function secret**: `OPENAI_API_KEY` for the `ai-gateway` function (see PRODUCT_DOCUMENTATION.md and AI_CONCIERGE_RECOMMENDATION.md).  
   - Deploy: `supabase functions deploy ai-gateway`.  
   - Ensure **users** has a **subscription_tier** (or equivalent) so the app can gate by Free / Super / Premium.

2. **Billing / entitlements**  
   - When you integrate billing (App Store, Play, Stripe): when a user subscribes to **Super** or **Premium**, write their tier (and optionally `premium_until`) to your DB so the app and Edge Function can enforce access.  
   - Until then: you can set `subscription_tier` manually in DB for testing (e.g. `super` or `premium`).

3. **App**  
   - Use **subscription_tier** from context everywhere you gate AI (see `lib/ai/aiFeatureGate.ts`).  
   - Use the **WinklyAISpark** component for every AI entry point; it handles disabled state and upsell modal.

4. **Edge Function (server-side enforcement — IMPLEMENTED)**  
   - `ai-gateway` **derives the tier from `users.subscription_tier`** (server-side lookup, short Redis cache) and enforces a **tier access matrix** (`TASK_MIN_TIER`) for every billable AI task. The client gate (`lib/ai/aiFeatureGate.ts`) is **UX only** and is treated as untrusted.
   - **Free = no AI** (all billable tasks denied). **Super+**: `chat_topics`, `planner_theme_plans`, `event_suggest`, `plan`, `winkly_plan`, `match_agent`. **Premium+** (full concierge): `concierge`, `match_bridge`.
   - Denied requests return **HTTP 403** with `{ code: "ai_tier_required", tier, required_tier, upgrade_to }` so the client can show contextual upsell (`upgrade_to` = `super` or `premium`).
   - **Feature flags (env):** `AI_GATEWAY_DISABLED` (global kill switch → 503, `code: "ai_disabled"`) and `AI_DISABLED_TIERS="free,super"` (per-tier disable → 403, `code: "ai_disabled_for_tier"`).
   - **Cost guards:** output-token ceiling `AI_MAX_OUTPUT_TOKENS` (default 2048) on every provider call; input guard `AI_MAX_CONTEXT_CHARS` (default 24000 → 413, `code: "context_too_large"`); `user_prompt` truncated to 2000 chars; `candidates` clamped to 50.
   - **Quota handling:** provider quota exhaustion (Gemini `RESOURCE_EXHAUSTED`, OpenAI `insufficient_quota`) is non-retryable → **429** `code: "quota_exhausted"`.
   - See **PRODUCT_DOCUMENTATION.md** §3.7 for the full env list and check order.

---

## 5. Pitfalls and things to consider

- **Backward compatibility:** If you already have `is_premium` (boolean), keep it during transition. Migration can set `subscription_tier = 'premium'` where `is_premium = true`, and `'free'` otherwise; new billing writes `subscription_tier` (free/super/premium/enterprise).
- **__DEV__:** ModeContext currently forces `subscription_tier = 'premium'` in development so you can test all features. **Note:** the gateway now enforces tier **server-side** from `users.subscription_tier`, so the dev override only affects client UX — to actually exercise AI you must have a matching DB tier (set `subscription_tier` on your test user). To test Free/Super denials, set the DB tier accordingly or use `AI_DISABLED_TIERS`.
- **Spark everywhere:** If the Spark appears in many screens, ensure the **upsell copy is contextual** (e.g. “Use AI to get better matches” on Discover vs “Get full trip planning with Premium” in Planner).
- **Rate limits / abuse:** Implemented — `ai-gateway` applies per-minute, per-tier, per-task Redis rate limits (HTTP 429 + `retry_after`) and logs usage in `ai_requests`. Cost guards cap output tokens and reject oversized input. Tune ceilings as traffic grows.
- **Offline / errors:** When the AI gateway fails or the user is offline, show a friendly message and do not block core flows (discover, planner, chat work without AI).

---

## 6. Summary

- **Free:** Full Winkly without AI; Spark visible but greyed, tap = upsell.  
- **Super:** Limited AI (matching, event suggestions, planning ideas, chat opener); Spark on for those, greyed for full concierge.  
- **Premium:** Full AI + concierge; Spark on everywhere.  
- **Activation:** Set `OPENAI_API_KEY`/`GEMINI_API_KEY`, deploy `ai-gateway`, store `subscription_tier`. AI access is **enforced server-side** in the gateway (tier matrix + feature flags + cost guards); the app gate is UX only.  
- **Spark:** One icon, coloured when allowed, grey when not; tap when grey = contextual upsell and “See plans”.

See **PRODUCT_DOCUMENTATION.md** §8.9 (Subscription and premium) and §9.2 (WinklyAISpark).
