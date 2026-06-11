# Winkly Operations Runbook

**Last updated:** 2026-06-10

Operational procedures for AI cost control, incident response, and production secret hygiene.

---

## 1. AI kill switch

Disable all AI immediately without redeploying the mobile app.

| Action | How |
|--------|-----|
| **Disable AI globally** | Supabase Dashboard → Edge Functions → Secrets → set `AI_GATEWAY_DISABLED=1` on **winkly-production** (`orjccytcmklzcfjgqwwj`). Redeploy `ai-gateway` if the function was already warm. |
| **Verify** | Any authenticated `ai-gateway` billable task returns **503** with `{ "code": "ai_disabled" }`. |
| **Re-enable** | Remove the secret or set `AI_GATEWAY_DISABLED=0`, then redeploy `ai-gateway`. |

**Per-tier disable (optional):** `AI_DISABLED_TIERS=free,super` returns **403** `{ "code": "ai_disabled_for_tier" }` for listed tiers.

**Client impact:** Concierge and Planner show friendly offline-style messaging; core app (chat, discover, events) continues to work.

---

## 2. Production secrets checklist (Concierge P0)

Audit names only (never paste values in chat):

```bash
npx supabase secrets list --project-ref orjccytcmklzcfjgqwwj
```

| Secret | Required for Concierge launch | Notes |
|--------|------------------------------|-------|
| `ANTHROPIC_API_KEY` | Yes (Premium primary) | Set on prod ✓ |
| `GEMINI_API_KEY` | Yes (Super primary) | Set on prod ✓ |
| `OPENAI_API_KEY` | Yes (fallback) | Set on prod ✓ |
| `UPSTASH_REDIS_REST_URL` | **Yes** | **Missing on prod (2026-06-10)** — copy from dev or create Upstash DB |
| `UPSTASH_REDIS_REST_TOKEN` | **Yes** | **Missing on prod** — without Redis, burst rate limits are skipped |
| `GOOGLE_PLACES_API_KEY` | Recommended | **Missing on prod** — venue grounding falls back to OSM Nominatim |
| `AUTH_REDIRECT_STATE_SECRET` | Yes | Set on prod ✓ |
| `MOCK_FACE_MATCH` | Must **not** be set | Not present ✓ |
| `AI_GATEWAY_DISABLED` | Must **not** be set | Not present ✓ |

**Set missing secrets (run locally, not in Cursor chat):**

```bash
npx supabase secrets set UPSTASH_REDIS_REST_URL=https://YOUR.upstash.io --project-ref orjccytcmklzcfjgqwwj
npx supabase secrets set UPSTASH_REDIS_REST_TOKEN=YOUR_TOKEN --project-ref orjccytcmklzcfjgqwwj
npx supabase secrets set GOOGLE_PLACES_API_KEY=YOUR_KEY --project-ref orjccytcmklzcfjgqwwj
npx supabase functions deploy ai-gateway --project-ref orjccytcmklzcfjgqwwj
```

Dev project (`gwgjdpqskusuejlwrsnd`) already has Upstash; reuse the same Upstash instance for prod or provision a dedicated prod database.

---

## 3. AI cost guardrails

### 3.1 Daily usage query (Supabase SQL)

Run in Dashboard → SQL Editor (production) or via MCP `execute_sql`:

```sql
-- AI requests per task in the last 24 hours
SELECT
  task,
  COUNT(*) AS request_count,
  COUNT(DISTINCT user_id) AS unique_users
FROM public.ai_requests
WHERE created_at >= now() - interval '24 hours'
GROUP BY task
ORDER BY request_count DESC;

-- Hourly spike detector (alert if any hour > threshold)
SELECT
  date_trunc('hour', created_at) AS hour,
  task,
  COUNT(*) AS request_count
FROM public.ai_requests
WHERE created_at >= now() - interval '7 days'
GROUP BY 1, 2
HAVING COUNT(*) > 500
ORDER BY hour DESC, request_count DESC;
```

**Test threshold:** Start with **> 500 requests/hour** for any single `task` on production. Tune down after launch based on expected MAU.

> **Note:** `ai_requests` stores `user_id`, `mode`, `task` only (no provider column). Provider is returned in gateway JSON responses. For per-provider splits, use Edge Function logs or add a future migration column.

### 3.2 PostHog alert (recommended)

1. PostHog → **Insights** → create a trend on custom event `ai_request_completed` (if instrumented) or proxy via `planner_open` + concierge funnel events.
2. **Alerts** → notify when daily count exceeds **2× baseline** (set baseline after first week of prod traffic).
3. EU projects: use `https://eu.i.posthog.com`.

### 3.3 Sentry alert (optional)

If Sentry is wired for Edge Functions, alert on:
- `ai-gateway` error rate > 5% over 15 minutes
- HTTP 429 spike from provider responses (`quota_exhausted`, `limit_reached`)

### 3.4 Response playbook

| Symptom | Action |
|---------|--------|
| Sudden cost spike | Set `AI_GATEWAY_DISABLED=1` (§1), investigate SQL (§3.1), check for abuse user_id |
| Provider quota exhausted | Gateway returns 429 `quota_exhausted`; users see rate-limit card. Add/fallback API keys; consider lowering `AI_FREE_PLANS_PER_DAY`. |
| Redis down | Gateway skips burst limits (`redis_unreachable` in logs). Restore Upstash; do not leave prod without Redis long-term. |

---

## 4. Concierge launch model (Decision D1a)

**Chosen path:** Free tier gets **3 AI plans/day** (`planner_theme_plans` + `winkly_plan`, shared pool). Not the `LAUNCH_TIER_OVERRIDE` migration (Decision D1b).

| Control | Location |
|---------|----------|
| Daily free allowance | `AI_FREE_PLANS_PER_DAY` (default `3`) on `ai-gateway` |
| Per-minute burst | Redis `rl:free:{task}:{userId}:{minute}` — limit `2/min` for plan tasks |
| Daily quota enforcement | `ai_requests` count since UTC midnight |
| Client upsell | `ConciergeRateLimitCard` on 429 `limit_reached` / daily quota |

**Rollback D1a:** Set `AI_FREE_PLANS_PER_DAY=0` to deny free plan tasks again, or switch to D1b migration (`LAUNCH_TIER_OVERRIDE`) if billing launches early.

---

## 5. QA — preview rate-limit card (simulator)

Dev builds only. In `apps/mobile/.env`:

```env
EXPO_PUBLIC_DEBUG_CONCIERGE_RATE_LIMIT=burst
```

Restart Metro, open Concierge or Planner flow, and submit a plan request. The gateway is **not** called; `ConciergeRateLimitCard` appears with a “Dev preview” badge.

| Value | Card shown |
|-------|------------|
| `burst` or `1` | Per-minute burst limit + retry + save for later |
| `daily` | Daily free quota + See plans |
| `tier` | Super upsell |
| `tier_premium` | Premium concierge upsell |

Remove the variable (or leave empty) before release builds.

---

## 6. Related docs

- **docs/API_KEYS_AND_ENV.md** — full env reference
- **docs/SUBSCRIPTION_TIERS_AND_AI.md** — tier matrix and gateway enforcement
- **docs/PRODUCT_DOCUMENTATION.md** §3.7 — AI gateway check order
