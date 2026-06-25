# weekly-spark-cron

Generates each active user's **Weekly Spark** — up to 3 ready-to-go plans per week
(SOLO / DATE / MEETUP) — shown at the top of the Planner. Runs weekly via pg_cron
(see `supabase/migrations/20260630121000_weekly_spark_cron_schedule.sql`).

## Trust model (why this function is strict)

A Spark is an **unattended, concierge-branded** plan. It must be as trustworthy as if
the user had googled it himself. Therefore:

- The AI only **selects** a candidate and writes the personalized `fit_reason`. It never
  authors venue facts (name, address, hours, price, link).
- Every venue is resolved + validated against Google Places via the shared
  `_shared/verifiedPlace.ts#resolveVerifiedPlace` and cached in `verified_places`
  (7-day TTL). A popular café is verified once per week and reused across all users.
- The MEETUP slot prefers a **real** local event from `get-nearby-external-events`
  (real time, real ticket link), falling back to a verified group-friendly venue.
- **Validation gate** before persist: resolved `place_id` + real address +
  `business_status == OPERATIONAL` + `opening_hours` covering the proposed `starts_at`
  (events: a future `starts_at` + a real `https` URL). Candidates that fail are discarded;
  a slot that can't be filled is **skipped** (better 2 great Sparks than 3 with a dud).

## ⚠️ Required secret — fails closed without it

`GOOGLE_PLACES_API_KEY` (or `GOOGLE_MAPS_API_KEY`) is **mandatory**. Without it the cron
**produces no Spark** and logs an error — it will never emit "world-knowledge" venues from
the model's memory. This is the same key already used by `ai-gateway` grounding and
`weather-pivot-cron`; no new vendor.

```sh
supabase secrets set GOOGLE_PLACES_API_KEY=<key>     # REQUIRED (fail-closed without it)
supabase secrets set CRON_SECRET=<random-strong-secret>
# Optional:
#   GEMINI_API_KEY=<key>          # selection + reason via Gemini; without it a deterministic,
#                                 # honest fallback reason is used (facts still 100% verified)
#   SPARK_MAX_USERS=150           # cap per invocation (shard larger bases)
#   SPARK_SPONSORED_ENABLED=false # sponsorship rails; OFF at launch (organic-only)
```

## Deploy + enable

```sh
supabase functions deploy weekly-spark-cron
supabase secrets set GOOGLE_PLACES_API_KEY=<key> CRON_SECRET=<secret>
```

Then point the schedule at the project (shared singleton with weather-pivot-cron):

```sql
INSERT INTO private.webhook_config (id, function_base_url, cron_secret)
VALUES (true, 'https://<project-ref>.supabase.co', '<same CRON_SECRET>')
ON CONFLICT (id) DO UPDATE
  SET function_base_url = COALESCE(EXCLUDED.function_base_url, private.webhook_config.function_base_url),
      cron_secret       = EXCLUDED.cron_secret;
```

Until `function_base_url` + `cron_secret` are set, the pg_cron job no-ops (no errors).

## Manual test

```sh
# Fail-closed check (UNSET the key): expect HTTP 503, zero rows, error log.
curl -i -X POST "$SUPABASE_URL/functions/v1/weekly-spark-cron" -H "x-cron-secret: $CRON_SECRET"

# With the key set: expect { ok: true, sparks_created, plans_created, query_cache_size }.
```

A second user mapped to the same venue in the same week triggers **no** extra Places call
(Place Details is served from `verified_places`; Text Search is memoized per run).

## Scheduling

Weekly, Mondays 06:00 UTC (`0 6 * * 1`). Idempotent per `(user_id, week_start)` — a re-run
in the same week is a no-op.
