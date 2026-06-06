# Supabase project refs (Winkly)

| Environment | Dashboard | Project ref | Region | GitHub |
| ----------- | --------- | ----------- | ------ | ------ |
| **Production** (winkly-production) | [winkly-production](https://supabase.com/dashboard/project/orjccytcmklzcfjgqwwj) | `orjccytcmklzcfjgqwwj` | eu-west-1 | [`mywinkly-cell/winkly-production`](https://github.com/mywinkly-cell/winkly-production) |
| **Development** | Local `supabase start` | n/a | n/a | Main app repo |

**Staging:** A separate `winkly-staging` cloud project is **deferred until app publishing**. Until then, use **local** for day-to-day dev and **winkly-production** for cloud QA and release builds.

## CLI helpers (from repo root)

```bash
npm run supabase:link:production
npm run supabase:push:production   # migrations → winkly-production
```

## Edge Function secrets

Audit (names only):

```bash
npx supabase secrets list --project-ref orjccytcmklzcfjgqwwj
```

**Production minimum (blocking for launch):**

| Secret | Functions |
|--------|-----------|
| `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | ai-gateway (Anthropic = Premium primary) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | ai-gateway rate limits + cache |
| `CORS_ALLOWED_ORIGINS` | ai-gateway, delete-account |
| `WEBHOOK_SECRET` + `private.webhook_config` row | notify-fanout (server push) |
| `EXPO_ACCESS_TOKEN` | notify-fanout, pending-plan-confirm (Expo Push API) |
| `AUTH_REDIRECT_STATE_SECRET` | auth-redirect (HTTPS email links) |

Optional: `MEETUP_API_KEY`, `EVENTBRITE_PRIVATE_TOKEN`, `GOOGLE_PLACES_API_KEY`. Full reference: **docs/API_KEYS_AND_ENV.md** §3.1.

```bash
npx supabase secrets set --project-ref orjccytcmklzcfjgqwwj GEMINI_API_KEY=... OPENAI_API_KEY=... ANTHROPIC_API_KEY=...
```
