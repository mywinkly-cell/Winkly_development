# Supabase project refs (Winkly)

| Repo | Supabase project | Project ref | Region | Role |
| ---- | ---------------- | ----------- | ------ | ---- |
| [**WinklyApp_3**](https://github.com/mywinkly-cell/WinklyApp_3) (public) | **WinklyApp** (development) | `gwgjdpqskusuejlwrsnd` | eu-central-1 | Cloud dev — test migrations & Edge Functions here first |
| [**winkly-production**](https://github.com/mywinkly-cell/winkly-production) (private) | **winkly-production** | `orjccytcmklzcfjgqwwj` | eu-west-1 | Production — ship only after dev cloud QA |
| *WinklyApp_3* (local) | `supabase start` | n/a | n/a | Optional fast iteration before cloud dev push |

Dashboards: [WinklyApp (dev)](https://supabase.com/dashboard/project/gwgjdpqskusuejlwrsnd) · [winkly-production](https://supabase.com/dashboard/project/orjccytcmklzcfjgqwwj)

---

## Migration rule (strict — one direction only)

**`supabase/migrations/` is owned by `WinklyApp_3` only.** Never author or edit migrations in `winkly-production`.

```
WinklyApp_3 (author)  →  supabase db reset (local)  →  push dev cloud  →  promote code  →  push prod cloud
                              ↓                              ↓                                    ↓
                         local stack                  gwgjdpqskusuejlwrsnd              orjccytcmklzcfjgqwwj
```

1. Create migration files only in **WinklyApp_3** (`supabase migration new …`).
2. Verify locally: `supabase db reset`.
3. Push to **development** cloud: `npm run supabase:push:development`.
4. QA on dev cloud (app pointed at `gwgjdpqskusuejlwrsnd` if needed).
5. Promote **`WinklyApp_3/main` → `winkly-production/main`** (code snapshot includes mirrored `supabase/`).
6. Push to **production** cloud from either checkout **with identical migration files**: `npm run supabase:push:production` (typically run from `winkly-production` after promote).

Before any prod push, always dry-run:

```bash
npm run supabase:push:production:dry-run
```

---

## CLI helpers (from **WinklyApp_3** repo root)

```bash
npm run supabase:link:development
npm run supabase:push:development          # migrations → gwgjdpqskusuejlwrsnd
npm run supabase:push:development:dry-run

npm run supabase:link:production
npm run supabase:push:production           # migrations → orjccytcmklzcfjgqwwj
npm run supabase:push:production:dry-run
```

Edge Functions: deploy to **development** first, then **production** after QA (`npx supabase functions deploy <name> --project-ref <ref> --use-api`).

---

## Edge Function secrets

Audit (names only):

```bash
npx supabase secrets list --project-ref gwgjdpqskusuejlwrsnd   # development
npx supabase secrets list --project-ref orjccytcmklzcfjgqwwj   # production
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

Optional: `MEETUP_API_KEY`, `EVENTBRITE_PRIVATE_TOKEN`, `GOOGLE_PLACES_API_KEY`. Full reference: **docs/API_KEYS_AND_ENV.md**.

**CORS / webhook base URLs:**

| Project | `CORS_ALLOWED_ORIGINS` / `function_base_url` |
| ------- | -------------------------------------------- |
| Development | `https://gwgjdpqskusuejlwrsnd.supabase.co` |
| Production | `https://orjccytcmklzcfjgqwwj.supabase.co` |

---

## winkly-production repo — does it need `supabase/`?

**Yes.** On each promote, `winkly-production/main` should include the **full mirrored** `supabase/` tree from `WinklyApp_3/main` (migrations, `functions/`, `config.toml`, scripts). That way:

- `supabase db push` run from the **private** repo reflects exactly what ships to `orjccytcmklzcfjgqwwj`.
- The private repo stays a complete deployable snapshot, not just mobile app code.

**Authoring stays in WinklyApp_3** — `winkly-production` only receives copies via promote PR/merge, never hand-edited migration files.

Verify mirror after first promote:

```bash
# In winkly-production checkout
ls supabase/migrations | wc -l    # should match WinklyApp_3 (52 SQL files + README)
npm run supabase:push:production:dry-run
```

**Status (2026-06-06):** Dry-run from **WinklyApp_3** against both cloud projects reports **Remote database is up to date** (52 migrations applied on dev and prod). Re-run dry-run after any new migration before prod push.
