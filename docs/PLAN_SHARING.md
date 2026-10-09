# Shareable plan links (web "I'm in")

**Last updated:** 2026-10-09

Every plan can become an invitation. The host taps **Share plan**, sends the link (WhatsApp,
Telegram, iMessage, …), and the friend answers **"I'm in 🙌"** in the browser — no app needed.
When the friend later installs Winkly and signs up with the same email (or opens the link in the
app), they become a normal participant and the plan shows up in their planner.

## Flow

```
Host (app)                     Friend (browser)                     Friend (app, later)
──────────                     ────────────────                     ───────────────────
Share plan ─ create_plan_share ─▶ mywinkly.de/p/<token>
  native share sheet             (Vercel fn → get_shared_plan)
  "I planned something for us    "I'm in" → first name + email
   😄 {title} · {when}.           ─ web_rsvp (rate-limited) ─▶ plan_share_rsvps (pending)
   You in? {link}"
Planner item details:                                               signs up with that email →
  "Anna is in — via link"  ◀──────────────────────────────────────  claim_plan_share_rsvps → participant
                                 "Open in Winkly" → /app/p/<token> ▶ accept_plan_share → participant
```

## Where it lives

| Piece | Location |
|---|---|
| Tables, RLS, RPCs | `supabase/migrations/20261009120000_plan_shares_web_rsvp.sql` |
| DB regression test (CI) | `supabase/tests/plan_shares_test.sql` |
| Web page `/p/<token>` (server-rendered, OG tags) | `website/api/plan.mjs`, `website/src/planShare/render.mjs` |
| Link preview image `/p/<token>/og.png` (1200×630) | `website/api/plan-og.mjs`, `website/src/planShare/og.mjs` (`@vercel/og`) |
| Anonymous web analytics beacon | `website/api/plan-event.mjs`, `website/src/planShare/analytics.mjs` |
| Web page strings (en, de; Accept-Language) | `website/src/planShare/strings.mjs` |
| Rewrites (`/p/:token`, `/p/:token/og.png`, `/app/p/:token`) | `website/vercel.json` |
| Website tests | `website/test/planPage.test.mjs` (`npm test` in `website/`) |
| App: share, link API, pending token | `apps/mobile/lib/planShare/` |
| App: host RSVP list + revoke | `apps/mobile/components/planner/PlanShareSection.tsx` |
| App: conversion after sign-in / link opened | `apps/mobile/components/PlanShareSync.tsx` |
| App: deep link `/app/p/<token>` | `apps/mobile/app/app/[...rest].tsx` |
| App tests | `apps/mobile/__tests__/planShare.test.ts` |

**Share plan** appears on: planner item cards (organiser, active, upcoming), the planner item
details sheet, and Weekly Spark cards (a Spark not yet in the planner asks to add it first, because
a link always points at a real planner item).

## Security & privacy model

- **`plan_shares`** — RLS owner-only (select/insert/update/delete). Clients may only choose
  `planner_item_id`, `expires_at`, `max_uses`, `time_zone` (column grants) and set `revoked_at`;
  the token (144 random bits, set by a trigger), `use_count` and ownership are server-controlled.
  Only the planner item's creator can create a link. A revoked link can't be re-enabled.
- **Expiry** — 7 days by default (`expires_at` default), hard max 30 days (check constraint).
  A link also stops working once the plan is cancelled or more than 3 hours in the past.
- **Public read** — only via `get_shared_plan(token)` (SECURITY DEFINER, granted to anon):
  title, start time, host time zone, neighbourhood (derived from meta; street names, house numbers
  and postcodes are stripped), host **first name** + main photo, and the AI fit line (only for
  AI-made plans — free-form host notes are never exposed). Never last names, age, birthday,
  exact address, place ids, user ids or emails. Dead links (revoked / expired / cancelled) return
  only their status.
- **`web_rsvp(token, name, email)`** — SECURITY DEFINER, granted to anon. Rate limits (fail
  closed): per IP 5 / 10 min and 20 / day, per link 30 / hour; requests without an IP share one
  bucket; bad-token guesses count too. IPs are stored only as SHA-256 hashes and pruned after a day.
  Repeat answers with the same email update the name instead of taking another seat.
- **`plan_share_rsvps`** — host can read `first_name`/`status` (RLS + column grants);
  **emails are never client-readable**.
- **Conversion** — `claim_plan_share_rsvps()` converts pending RSVPs for the caller's
  **confirmed** email, and only RSVPs given **before the account existed** — so typing an
  existing user's email on the web can never push a plan into their planner. Existing users join
  explicitly by opening the link in the app (`accept_plan_share`), which also converts their RSVP.
  Blocks (`user_blocks`) in either direction make the link behave as unavailable.

## Analytics (`apps/mobile/lib/analytics/events.ts`)

| Event | Where | Props |
|---|---|---|
| `plan_shared` | app, after the share sheet completes | `source`: `planner_card` · `planner_details` · `weekly_spark` |
| `share_link_opened` | app (`/app/p/<token>` opened) · web (page beacon) | `surface`: `app` · `web` |
| `web_rsvp_submitted` | web (page beacon after a successful "I'm in") | `surface: web`, `lang` |
| `signup_from_share` | app, conversion within 24 h of account creation | `via`: `email` · `app_link` |
| `share_rsvp_converted` | app, a web RSVP became a participant | `via`: `signup` · `app_link`, `count` |

App events go through `trackEvent` (consent-gated). Web events are cookieless and anonymous: no
cookies, no stored ids, a random `distinct_id` per event, person profiles off, the token is never
sent; disabled unless `WINKLY_POSTHOG_KEY` is set.

## Configuration (Vercel → mywinkly.de project → Environment Variables)

| Variable | Required | Value |
|---|---|---|
| `WINKLY_SUPABASE_URL` | yes | `https://<project>.supabase.co` (production) |
| `WINKLY_SUPABASE_ANON_KEY` | yes | the public anon / publishable key — **never** the service role key |
| `WINKLY_SITE_ORIGIN` | no | `https://mywinkly.de` (defaults to the request origin; set it so OG URLs are canonical) |
| `WINKLY_APP_STORE_URL` | no | iOS App Store link for "Get the app" (hidden on iOS until set) |
| `WINKLY_PLAY_STORE_URL` | no | defaults to the Play listing of `com.winkly.app` |
| `WINKLY_POSTHOG_KEY` / `WINKLY_POSTHOG_HOST` | no | enable anonymous web events (host defaults to `https://us.i.posthog.com`) |

## Testing

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/plan_shares_test.sql   # also in CI (db-tests)
npm test -w website                                                               # page, OG, analytics
npm test -w apps/mobile -- planShare                                              # app logic
```

Manual end-to-end: share a plan to WhatsApp → the preview shows the image + title → open on a
phone without Winkly → "I'm in" → the host sees "Anna is in — via link" in the plan details →
install, sign up with the same email, confirm it → the plan is in the friend's planner.
