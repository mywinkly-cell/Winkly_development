# API Keys and Environment Variables — Winkly

**Last updated:** 2026-05-06

This doc lists every API key and env var used by Winkly, where they are used, and **how to set them**. You must set these yourself (in Supabase Dashboard / CLI and in the mobile app `.env`); the app cannot set them for you.

---

## 1. Overview

| Where | What | Set by you? |
|-------|------|-------------|
| **Mobile app** (`apps/mobile/.env`) | Supabase URL/key, auth redirect, PostHog, Google/Facebook OAuth | Yes — edit `.env` or use EAS/Expo env |
| **Supabase Edge Functions** (Supabase secrets) | Service role (auto), OpenAI, Gemini, Meetup, Eventbrite | Yes — Dashboard or `supabase secrets set` |

---

## 2. Mobile app — `apps/mobile/.env`

All mobile env vars are prefixed with `EXPO_PUBLIC_` so they are available at build time. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill in values.

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
| `EXPO_PUBLIC_EAS_PROJECT_ID` | No | **Expo Push:** must be your Expo/EAS **Project ID UUID** (Dashboard → Project settings). Wired into `app.config.js` `extra.eas.projectId` only when valid; omit or leave unset for local **Expo Go**—especially **Android** (SDK 53+ remote push is not supported there; use an **EAS development build** to test push). |


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
| `GOOGLE_PLACES_API_KEY` or `GOOGLE_MAPS_API_KEY` | **ai-gateway** | Optional | Google Places **Text Search** (legacy API) for `EXTERNAL_PLACE_HINTS` during concierge/plan. When unset, OSM Nominatim is used (rate-limited; ok for hints). Enable “Places API” in Google Cloud for the key. |
| `MEETUP_API_KEY` | **get-nearby-external-events** | Optional | Meetup API key (or token). When set, Edge Function can fetch nearby Meetup events for Events home. When unset, external events from Meetup are not fetched. |
| `EVENTBRITE_PRIVATE_TOKEN` | **get-nearby-external-events** | Optional | Eventbrite private token. When set, Edge Function can fetch nearby Eventbrite events. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` (or `AWS_DEFAULT_REGION`) | **verify-profile-photo** | Optional | AWS Rekognition **CompareFaces** for selfie vs profile photo. When unset, verifications stay **pending** unless `MOCK_FACE_MATCH=true` (dev only). |
| `MOCK_FACE_MATCH` | **verify-profile-photo** | Optional | Set to `true` only in dev to mark verification as passed without Rekognition. |
| `DAILY_API_KEY` | **video-call-session** | Optional | [Daily.co](https://www.daily.co/) REST API — creates private rooms and meeting tokens for 1:1 video. When unset, returns a placeholder URL. |
| `SAGEMAKER_RUNTIME_ENDPOINT`, `SAGEMAKER_API_KEY` | **recompute-behavior-ml** | Optional | Custom HTTP endpoint (e.g. SageMaker) that returns JSON `{ score: number }` per pair; optional bearer key. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | **recompute-behavior-ml** | Optional | Bust cache key `winkly:feed:{user_id}` after updates when `user_id` is in the request body. |

**How to set (Supabase secrets):**

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
   ```
   Do **not** paste the key into Cursor chat or any shared place.
4. Redeploy so functions see the new secrets:
   ```bash
   npx supabase functions deploy ai-gateway
   npx supabase functions deploy get-nearby-external-events
   ```

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
| `GOOGLE_PLACES_API_KEY` / `GOOGLE_MAPS_API_KEY` | `supabase/functions/ai-gateway/index.ts` (optional Places Text Search for external venue hints). |
| `MEETUP_API_KEY` / `EVENTBRITE_PRIVATE_TOKEN` | `supabase/functions/get-nearby-external-events/index.ts` (when implemented) |

---

## 5. Checklist

- [ ] **Mobile:** `apps/mobile/.env` exists with at least `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] **Auth redirect:** If using email verification with redirect, set `EXPO_PUBLIC_AUTH_REDIRECT_URL` and add that URL to Supabase Auth → Redirect URLs.
- [ ] **PostHog:** Optional. Set `EXPO_PUBLIC_POSTHOG_API_KEY` in `.env` to enable analytics.
- [ ] **Google / Facebook sign-in:** Optional. Set the OAuth client/app IDs in `.env` and configure Supabase Auth providers.
- [ ] **AI concierge:** Optional. In Supabase, set `GEMINI_API_KEY` and/or `OPENAI_API_KEY` and deploy `ai-gateway`. **Gemini is used first** when its key is set (free tier–friendly); OpenAI is fallback when both are set, or sole provider when only OpenAI is set. Apply migration `20260406120000_concierge_event_trgm_and_rpc.sql` for fuzzy event matching (`match_events_for_concierge`). Optional: `GOOGLE_PLACES_API_KEY` or `GOOGLE_MAPS_API_KEY` (Places API enabled) for richer **EXTERNAL_PLACE_HINTS**; otherwise Nominatim is used.
- [ ] **External events (Meetup/Eventbrite):** Optional. Set `MEETUP_API_KEY` and/or `EVENTBRITE_PRIVATE_TOKEN` in Supabase secrets and deploy `get-nearby-external-events`. The Edge Function implements Meetup GraphQL and Eventbrite REST; when keys are set, Events home can show nearby external events.
- [ ] **Expo Push / EAS:** Optional for dev in Expo Go. For **standalone / dev builds**, set `EXPO_PUBLIC_EAS_PROJECT_ID` to your Expo **project UUID** if you need remote push tokens; **Android Expo Go** cannot exercise remote push (SDK 53+) — build with **EAS** (`eas build`) when testing pushes end-to-end.

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
- **OpenAI / Gemini / Meetup / Eventbrite** keys must only be in Supabase secrets (or in your local `.env` for app vars), never pasted in chat or committed to the repo.

---

## 8. AI 429 and weather (no extra keys)

- **“AI temporarily unavailable -429”:** HTTP 429 means **rate limit** from the LLM provider (OpenAI or Gemini). The app now shows: *“Too many requests — please wait a minute and try again.”* Even as the only user you can hit this because free-tier limits are low and one "Get suggestions" uses 2–5 API calls (tool loop). To see the AI working: wait ~1 minute and retry, or set a paid OpenAI or Gemini API key in Supabase secrets for higher limits during development.
- **Weather:** Winkly uses **Open-Meteo** for weather (ai-gateway and the concierge form). No API key is required. The app can show weather for a chosen date/location in the form and pass a `weather_snapshot` to the AI so it adapts suggestions. If you later switch to OpenWeatherMap or another provider, you would add that provider’s key to Supabase secrets and change the weather fetch in the gateway (and optionally in `lib/weatherClient.ts` for the form).
