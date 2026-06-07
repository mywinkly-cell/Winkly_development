# API Keys and Environment Variables — Winkly

**Last updated:** 2026-06-07

This doc lists every API key and env var used by Winkly, where they are used, and **how to set them**. You must set these yourself (in Supabase Dashboard / CLI and in the mobile app `.env`); the app cannot set them for you.

---

## 1. Overview

| Where | What | Set by you? |
|-------|------|-------------|
| **Mobile app** (`apps/mobile/.env`) | Supabase URL/key, auth redirect, PostHog, Google/Facebook OAuth | Yes — edit `.env` or use EAS/Expo env |
| **Supabase Edge Functions** (Supabase secrets) | Service role (auto), OpenAI, Gemini, Anthropic, Meetup, Eventbrite | Yes — Dashboard or `supabase secrets set` |

---

## 2. Mobile app — `apps/mobile/.env`

All mobile env vars are prefixed with `EXPO_PUBLIC_` so they are available at build time. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill in values.

> **Environments:** Local (`supabase start`), cloud **development** (`gwgjdpqskusuejlwrsnd` / Winkly_development), cloud **production** (`orjccytcmklzcfjgqwwj`). Templates: `.env.development`, `.env.cloud-development`, `.env.production`. Migrations authored only in Winkly_development. Full guide: **docs/ENVIRONMENTS.md**, **supabase/PROJECTS.md**.

| Variable | Required | Purpose |
|----------|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | **Yes** | Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Supabase anon (public) key. From Supabase Dashboard → Project Settings → API. |
| `EXPO_PUBLIC_AUTH_REDIRECT_URL` | No | Email verification redirect. Default `winkly://callback`. If using Edge Function: `https://YOUR_PROJECT.supabase.co/functions/v1/auth-redirect`. |
| `EXPO_PUBLIC_POSTHOG_API_KEY` | No | PostHog project API key. When set, analytics (screens, identity, lifecycle) are enabled. Leave empty to disable. |
| `EXPO_PUBLIC_POSTHOG_HOST` | No | PostHog host. Default `https://us.i.posthog.com` (use `https://eu.i.posthog.com` for EU). |
| `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | No | Google OAuth Android client ID (for Sign in with Google). |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | No | Google OAuth iOS client ID. |
| `EXPO_PUBLIC_FACEBOOK_APP_ID` | No | Facebook App ID (for Sign in with Facebook). |
| `EXPO_PUBLIC_ABLY_KEY` | No | Optional Ably API key for future pub/sub (match notifications). When unset, `lib/realtime/ablyOptional.ts` is a no-op; chat uses Supabase Realtime. |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | No | **Expo Push:** EAS **Project ID UUID**. **Linked project:** `5a6f6f9d-5969-4867-9572-5ee50a938066` (`@winkly/winkly`) — baked into `app.config.js` as fallback; also set on EAS for builds. Omit locally for **Expo Go**; use an **EAS development build** to test push (Android Expo Go cannot register remote push on SDK 53+). |


**How to set (mobile):**

1. In the repo: copy `apps/mobile/.env.example` to `apps/mobile/.env`.
2. Edit `apps/mobile/.env` and replace placeholders with your values.
3. **Do not commit `.env`** (it should be in `.gitignore`). For production builds (EAS), set the same variables in Expo Dashboard → Project → Secrets (or in `eas.json` env).

---

## 3. Supabase Edge Functions — secrets

These are **server-side only**. Never put them in the mobile app.

| Secret | Used by | Required | Purpose |
|--------|--------|----------|---------|
| `SUPABASE_URL` | All Edge Functions | **Auto** | Injected by Supabase when the function runs. You do not set this manually. |
| `SUPABASE_SERVICE_ROLE_KEY` | ai-gateway, others | **Auto** | Injected by Supabase. Used to call Supabase APIs bypassing RLS (e.g. fetch events for AI tools). |
| `OPENAI_API_KEY` | **ai-gateway** | Optional | OpenAI API key. When set **without** `GEMINI_API_KEY`, tasks `plan`, `concierge`, `event_suggest` use GPT + tools. When **both** keys are set, OpenAI is **fallback** only (after Gemini or on 429). |
| `GEMINI_API_KEY` | **ai-gateway** | Optional | Google Gemini API key. **Primary** when set (including when both keys exist—matches free-tier usage in AI Studio). Optional overrides: `GEMINI_MODEL` (default **`gemini-2.0-flash`**), `GEMINI_MODEL_LITE` (**`gemini-2.0-flash-lite`**), `GEMINI_MODEL_TOPICS` (**`gemini-2.0-flash-lite`**), `GEMINI_MODEL_PLAN` (**`gemini-2.0-flash`**). |
| `ANTHROPIC_API_KEY` | **ai-gateway** | **Recommended for Premium** | Anthropic API key for Claude. **Primary LLM for Premium/Enterprise** users (concierge, match_bridge, plan, event_suggest, winkly_plan). Super tier uses Gemini first. Fallback chain for Premium: Claude → Gemini → OpenAI. Optional overrides: `ANTHROPIC_MODEL` (default **`claude-sonnet-4-20250514`**), `ANTHROPIC_MODEL_LITE` (**`claude-3-5-haiku-20241022`**), `ANTHROPIC_MODEL_PLAN` (**`claude-sonnet-4-20250514`**). |
| `GOOGLE_PLACES_API_KEY` or `GOOGLE_MAPS_API_KEY` | **ai-gateway** | Optional | Google Places **Text Search** (legacy API) for `EXTERNAL_PLACE_HINTS` during concierge/plan. When unset, OSM Nominatim is used (rate-limited; ok for hints). Enable “Places API” in Google Cloud for the key. |
| `MEETUP_API_KEY` | **get-nearby-external-events** | Optional | Meetup API key (or token). When set, Edge Function can fetch nearby Meetup events for Events home. When unset, external events from Meetup are not fetched. |
| `EVENTBRITE_PRIVATE_TOKEN` | **get-nearby-external-events** | Optional | Eventbrite private token. When set, Edge Function can fetch nearby Eventbrite events. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (or `AWS_DEFAULT_REGION`) | **verify-profile-photo** | Optional | AWS Rekognition **CompareFaces** for selfie vs profile photo. When unset, verifications stay **pending** unless `MOCK_FACE_MATCH=true` (dev only). |
| `MOCK_FACE_MATCH` | **verify-profile-photo** | Optional | Set to `true` only in dev to mark verification as passed without Rekognition. |
| `DAILY_API_KEY` | **video-call-session** | Optional | [Daily.co](https://www.daily.co/) REST API — creates private rooms and meeting tokens for 1:1 video. When unset, returns a placeholder URL. |
| `SAGEMAKER_RUNTIME_ENDPOINT`, `SAGEMAKER_API_KEY` | **recompute-behavior-ml** | Optional | Custom HTTP endpoint (e.g. SageMaker) that returns JSON `{ score: number }` per pair; optional bearer key. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | **ai-gateway**, **recompute-behavior-ml** | **Recommended (prod)** | **ai-gateway:** per-tier/per-task rate limits + response caches (skips limits when unset). **recompute-behavior-ml:** busts cache key `winkly:feed:{user_id}` after updates. |
| `CORS_ALLOWED_ORIGINS` | **ai-gateway**, **delete-account** | **Recommended (prod)** | Comma-separated browser origins allowed for CORS preflight. When unset, defaults to localhost (dev). Production example: `https://YOUR_PROJECT_REF.supabase.co`. Native mobile `supabase.functions.invoke` is unaffected. |
| `EXPO_ACCESS_TOKEN` | **notify-fanout**, **pending-plan-confirm**, **expo-push-notify** | **Recommended (prod)** | Expo account access token ([expo.dev](https://expo.dev) → Account → Access tokens). Improves Expo Push API reliability and rate limits. Same token family as GitHub `EXPO_TOKEN` for EAS CI. |
| `WEBHOOK_SECRET` | **notify-fanout** | **Required for server push** | Shared secret for `x-webhook-secret` header from Postgres `pg_net` triggers. **Must match** `private.webhook_config.secret` in the database. Generate a strong random string; set via CLI/Dashboard, then sync the DB row (see §3.1). |
| `AUTH_REDIRECT_STATE_SECRET` | **auth-redirect** | **Recommended (prod)** | Random string **≥ 16 characters**. Signs `winkly_state` CSRF tokens (`GET …/auth-redirect?action=mint`). Required for production when using HTTPS `EXPO_PUBLIC_AUTH_REDIRECT_URL`. |

**Local Edge Functions (`supabase start` / `supabase functions serve`):**

1. Copy `supabase/functions/.env.example` → `supabase/functions/.env`.
2. Fill in the same values you set in the Supabase Dashboard (including `ANTHROPIC_API_KEY`). **Never put real keys in `.env.example`** — that file is tracked in git.
3. For `supabase/config.toml` `[edge_runtime.secrets]`, also set `ANTHROPIC_API_KEY` in the **repo root** `.env` (git-ignored), or export it in your shell before `supabase start`.
4. Restart the local stack if it is already running: `supabase stop` then `supabase start`.

**How to set (Supabase secrets — cloud):**

**Option A — Supabase Dashboard (recommended: key never touches your terminal or chat)**

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Project Settings** (gear) → **Edge Functions** → **Secrets** (or **Manage secrets**).
3. Click **Add new secret**. Enter the name (e.g. `OPENAI_API_KEY`) and paste the value in the Dashboard only. Save.
4. Repeat for each key. Redeploy the functions that use them (e.g. **Deploy** for `ai-gateway` and `get-nearby-external-events`).

**Option B — Supabase CLI (run in your own terminal, not in Cursor chat)**

Run the commands **on your machine** in PowerShell or Command Prompt. When you type or paste the key, it stays in **your** terminal session and is not sent to Cursor.

1. Install and log in: `npx supabase login`.
2. Link the project: `npx supabase link --project-ref YOUR_REF`.
3. Set each secret by running the command **locally** and pasting the key **only in that terminal window**:
   ```bash
   npx supabase secrets set OPENAI_API_KEY=sk-your-actual-key-here
   npx supabase secrets set GEMINI_API_KEY=your-actual-gemini-key-here
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
   ```
   Or copy `supabase/functions/.env.example` → `supabase/functions/.env`, fill in values locally, then push all at once:
   ```bash
   cd supabase/functions
   npx supabase secrets set --env-file .env
   ```
   Do **not** paste the key into Cursor chat or any shared place.
4. Redeploy so functions see the new secrets:
   ```bash
   npx supabase functions deploy ai-gateway
   npx supabase functions deploy get-nearby-external-events
   npx supabase functions deploy notify-fanout
   ```

### 3.1 Development checklist (`gwgjdpqskusuejlwrsnd` — Winkly_development)

Push migrations here **before** production. Audit secrets:

```bash
npx supabase secrets list --project-ref gwgjdpqskusuejlwrsnd
```

Use `CORS_ALLOWED_ORIGINS=https://gwgjdpqskusuejlwrsnd.supabase.co` and matching `private.webhook_config.function_base_url` when testing push on dev cloud.

### 3.2 Production checklist (`orjccytcmklzcfjgqwwj` — winkly-production)

Audit what's set (names only — no values):

```bash
npx supabase secrets list --project-ref orjccytcmklzcfjgqwwj
```

| Secret | Status (2026-06-06) | Action if missing |
|--------|---------------------|-------------------|
| `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | Set | Required for AI; **Anthropic** is primary for Premium tier |
| `UPSTASH_REDIS_REST_URL` + `TOKEN` | Set | Enables ai-gateway rate limits + caches |
| `CORS_ALLOWED_ORIGINS` | Set | `https://orjccytcmklzcfjgqwwj.supabase.co` |
| `WEBHOOK_SECRET` | Set | Must match `private.webhook_config.secret` (see below) |
| `AUTH_REDIRECT_STATE_SECRET` | Set | HTTPS email redirect CSRF |
| `EXPO_ACCESS_TOKEN` | **Not set** | Create at expo.dev → set secret → redeploy push functions |
| `MEETUP_API_KEY` | Optional | External events |
| `EVENTBRITE_PRIVATE_TOKEN` | Set | External events |
| `GOOGLE_PLACES_API_KEY` | Optional | Richer venue hints in ai-gateway |

**Sync `WEBHOOK_SECRET` with the database** (after setting the Edge Function secret):

```sql
INSERT INTO private.webhook_config (id, function_base_url, secret)
VALUES (true, 'https://orjccytcmklzcfjgqwwj.supabase.co', '<same-as-WEBHOOK_SECRET>')
ON CONFLICT (id) DO UPDATE
  SET function_base_url = EXCLUDED.function_base_url,
      secret = EXCLUDED.secret;
```

Remove any misnamed legacy secrets (e.g. old `WinklyApp` label) from Dashboard → Edge Functions → Secrets.

---

## 4. Where each key is used in code

| Key | File(s) |
|-----|---------|
| `EXPO_PUBLIC_SUPABASE_*` | `lib/supabase.ts`, `app.config.js`, `lib/ai/conciergeClient.ts`, `lib/externalEvents.ts` |
| `EXPO_PUBLIC_AUTH_REDIRECT_URL` | `constants/config.ts` |
| `EXPO_PUBLIC_POSTHOG_*` | `constants/config.ts`, `app/_layout.tsx` |
| `EXPO_PUBLIC_GOOGLE_*` / `EXPO_PUBLIC_FACEBOOK_*` | `app/(auth)/signin.tsx`, `app/(auth)/signup.tsx` |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | `app.config.js` (`extra.eas.projectId`), `lib/notifications.ts` (Expo Push token registration) |
| `OPENAI_API_KEY` | `supabase/functions/ai-gateway/index.ts` (fallback when `GEMINI_API_KEY` also set; primary when Gemini unset). |
| `GEMINI_API_KEY` | `supabase/functions/ai-gateway/index.ts` (primary when set). |
| `ANTHROPIC_API_KEY` | `supabase/functions/ai-gateway/index.ts` — **primary** for Premium/Enterprise; Gemini/OpenAI fallbacks. |
| `GOOGLE_PLACES_API_KEY` / `GOOGLE_MAPS_API_KEY` | `supabase/functions/ai-gateway/index.ts` (optional Places Text Search for external venue hints). |
| `MEETUP_API_KEY` / `EVENTBRITE_PRIVATE_TOKEN` | `supabase/functions/get-nearby-external-events/index.ts` (when implemented) |

---

## 5. Checklist

- [ ] **Mobile:** `apps/mobile/.env` exists with at least `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] **Auth redirect:** If using email verification with redirect, set `EXPO_PUBLIC_AUTH_REDIRECT_URL` and add that URL to Supabase Auth → Redirect URLs.
- [ ] **PostHog:** Optional. Set `EXPO_PUBLIC_POSTHOG_API_KEY` in `.env` to enable analytics.
- [ ] **Google / Facebook sign-in:** Optional. Set the OAuth client/app IDs in `.env` and configure Supabase Auth providers.
- [ ] **AI concierge:** In Supabase, set `ANTHROPIC_API_KEY` for **Premium** Claude routing, and/or `GEMINI_API_KEY` / `OPENAI_API_KEY` (Super uses Gemini first; Premium falls back to them). Deploy `ai-gateway`. Apply migration `20260406120000_concierge_event_trgm_and_rpc.sql` for fuzzy event matching. Optional: `GOOGLE_PLACES_API_KEY` or `GOOGLE_MAPS_API_KEY` for richer **EXTERNAL_PLACE_HINTS**.
- [ ] **External events (Meetup/Eventbrite):** Optional. Set `MEETUP_API_KEY` and/or `EVENTBRITE_PRIVATE_TOKEN` in Supabase secrets and deploy `get-nearby-external-events`. The Edge Function implements Meetup GraphQL and Eventbrite REST; when keys are set, Events home can show nearby external events.
- [ ] **Server push:** Set `EXPO_ACCESS_TOKEN` + `WEBHOOK_SECRET` in Supabase secrets; sync `private.webhook_config`; deploy `notify-fanout`. See §3.1.
- [ ] **Production CORS + Redis:** Set `CORS_ALLOWED_ORIGINS` and `UPSTASH_REDIS_REST_*` for ai-gateway scale/abuse protection.
- [ ] **Expo Push / EAS:** Linked project `@winkly/winkly` (`5a6f6f9d-5969-4867-9572-5ee50a938066`). Production/preview vars: `npm run eas:sync-production-env` in `apps/mobile` (reads `.env`). Test push on an **EAS build**, not Android Expo Go.

---

## 6. How to run code without pasting keys in chat

You should **never** paste real API keys into Cursor (or any chat). Here are safe ways to set and use them:

1. **Supabase secrets (Edge Functions)**  
   - **Best:** Use the **Supabase Dashboard** → Project Settings → Edge Functions → Secrets. Type or paste each key only in the Dashboard. It never goes through your terminal or Cursor.  
   - **Or:** Run `npx supabase secrets set NAME=value` in **your own terminal** (outside Cursor). Paste the key only in that terminal. Cursor never sees it.

2. **Mobile app (`.env`)**  
   - Edit `apps/mobile/.env` locally. Paste keys only in that file. Don’t paste the contents of `.env` into chat.  
   - For EAS/Expo production, set env vars in the Expo Dashboard (Secrets) so they’re not in the repo.

3. **If you already pasted a key in chat or terminal**  
   - Treat it as compromised. In the provider’s dashboard (OpenAI, Google, etc.), create a **new** key and **revoke** the old one. Set the new value in Supabase (Dashboard or CLI in your own terminal) and redeploy.

---

## 7. Security notes

- **Never commit** `apps/mobile/.env` or any file containing real API keys. Use `.env.example` (no real values) in the repo.
- **Never paste** API keys in chat, terminal history, or screenshots. If you did, **rotate them immediately** (create new keys in the provider’s dashboard and revoke the old ones), then set the new values in Supabase secrets and redeploy the functions.
- **Supabase anon key** is safe to ship in the app; RLS protects data. The **service role key** must stay only in Supabase (Edge Functions / backend).
- **OpenAI / Gemini / Anthropic / Meetup / Eventbrite** keys must only be in Supabase secrets (or in your local `supabase/functions/.env` for Edge dev), never pasted in chat or committed to the repo.

---

## 8. AI 429 and weather (no extra keys)

- **“AI temporarily unavailable -429”:** HTTP 429 means **rate limit** from the LLM provider (OpenAI or Gemini). The app now shows: *“Too many requests — please wait a minute and try again.”* Even as the only user you can hit this because free-tier limits are low and one "Get suggestions" uses 2–5 API calls (tool loop). To see the AI working: wait ~1 minute and retry, or set a paid OpenAI or Gemini API key in Supabase secrets for higher limits during development.
- **Weather:** Winkly uses **Open-Meteo** for weather (ai-gateway and the concierge form). No API key is required. The app can show weather for a chosen date/location in the form and pass a `weather_snapshot` to the AI so it adapts suggestions. If you later switch to OpenWeatherMap or another provider, you would add that provider’s key to Supabase secrets and change the weather fetch in the gateway (and optionally in `lib/weatherClient.ts` for the form).
