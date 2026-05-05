# AI Integration, Concierge & Date/Meet-up Invite — Recommendation

**Last updated:** 2026-02-17

This document structures how to integrate AI across Winkly so it acts as intended: profile analysis, match and opening-move suggestions, event/date/meet-up/business ideas, activity suggestions when nothing is planned, and a concierge that reduces mental and organisational load. It covers the **date/meet-up invite flow** (button in chat → form with suggestions → accept/decline/reschedule), **trip planning** (e.g. ski trip), **business offers prioritisation**, **data policies and safety**, and **existing similar solutions**.

---

## 1. Desired AI behaviour (summary)

| Area | Desired behaviour |
|------|-------------------|
| **Profiles** | Analyse user profiles (interests, location, wishlist, mode) to personalise suggestions. |
| **Matches** | Suggest relevant matches; opening moves / conversation starters. |
| **Events** | Suggest events (Winkly first, then external); “something to do” when nothing planned. |
| **Dates / meet-ups / business** | Suggest activities, locations, specific places (café, restaurant, tennis, etc.) and times. |
| **Concierge** | Plan activities from user requirements (prompt or form); check location, routes, weather, availability; prioritise Winkly events and business offers. |
| **Trip planning** | e.g. Ski trip: date, time, activity, location, invitees, budget → check locations, routes, rentals, hotels, restaurants, weather, snow; orchestrate and propose options. |
| **Date/meet-up invite** | In chat: “Invite on date/meet-up” → form with suggestions (activity, city, place, date/time); partner can accept, decline, reschedule or discuss in chat. |
| **Business partners** | Businesses host events and publish special offers; AI considers them **first** when suggesting (e.g. “Dinner for two” from a partner restaurant). |

---

## 2. Existing foundation (what you already have)

- **ai-gateway** Edge Function: auth, mode, task, allowlisted context, telemetry in `ai_requests`. Tasks: `rank`, `suggest`, `summarize`, `plan`, `concierge`, `event_suggest`. Tools: `get_weather` (Open-Meteo), `get_winkly_events`, `get_planner_items`. Optional OpenAI (when `OPENAI_API_KEY` set).
- **Client heuristics**: `lib/ai/romanceInsights.ts`, `friendsInsights.ts` (compatibility, tags, conversation starter) — no PII to external AI.
- **Concierge client**: `lib/ai/conciergeClient.ts` — `callConcierge({ task, context })` with allowlisted context.
- **Planner**: `planner_items`, `planner_participants`; `related_user_id` for linked user (e.g. date partner). **Planner invitations** screen exists (placeholder); needs backend for “invite for date/meet-up” (create planner_item + invite record, link to conversation).
- **Events**: `events`, `event_participants`, `event_invitations`. No dedicated **business_offers** table yet — required for “special offer: Dinner for two” prioritisation.
- **Tiers**: Free / Super / Premium; AI gated via `lib/ai/aiFeatureGate.ts` and Winkly AI Spark.

See **docs/AI_CONCIERGE_RECOMMENDATION.md** for provider choice, tools, and concierge flow.

---

## 3. Similar solutions (market reference)

| Solution | What they do | Relevance to Winkly |
|----------|--------------|----------------------|
| **Happn “Perfect Date”** | After match (“Crush”), AI suggests up to 5 venues from interests, habits, favourite spots, location. User keeps final choice. | Strong parallel: match → suggest venues → user decides. Winkly can add activity type (café/tennis/museum), both users’ cities, wishlist, and Winkly partner offers first. |
| **Bumble AI concierge (vision)** | AI narrows matches, helps communication; “date on your behalf” concept. | Winkly focuses on **planning** (suggestions, invite flow) rather than dating on behalf; same “reduce fatigue” goal. |
| **SoMe** | Venue-based matching + AI Date Planner (activities, restaurants, booking). | Close to Winkly: activity + place + booking intent; Winkly adds modes (friends, business, events) and Winkly-first (events, offers). |
| **Vail “My Epic Assistant”** | In-app AI for snow conditions, rentals, lessons, dining, run status. | Trip/orchestration pattern: one entry point, AI fetches conditions and options. |
| **Perfect Piste** | Invite-only AI concierge for ski trips; personalised resort/hotel/room. | Niche trip planning; Winkly’s ski example fits same “form + tools + options” pattern. |
| **Q Concierge + Inntopia** | Voice AI for booking accommodations, lift tickets, rentals, dining at ski resorts. | Booking and orchestration; Winkly can add “book with confirmation” later. |

**Takeaway:** Use AI to **suggest** and **reduce friction**; keep **final decision and consent** with the user. Prioritise **Winkly events and business offers** to differentiate and support partnerships.

---

## 4. Recommended architecture (high level)

- **Single AI entry point**: Keep all LLM and tool calls in **ai-gateway** (keys in Supabase; allowlisted context; no PII in telemetry).
- **Tasks** (extend as needed):
  - Existing: `rank`, `suggest`, `summarize`, `plan`, `concierge`, `event_suggest`.
  - Add: `date_invite_suggest` (activity + location + place + time for a date/meet-up with a specific peer); `trip_plan` (ski/friends/partner trip with invitees, budget, dates).
- **Tools** (add over time):
  - Keep: `get_weather`, `get_winkly_events`, `get_planner_items`.
  - Add: `get_winkly_business_offers` (when table exists) — filter by location, activity type, date; return partner offers first.
  - Add: `get_places` (stub → later Google Places or partner API; Winkly businesses/offers first).
  - Optional for trips: `get_routes` (directions), `get_rentals` / `get_accommodation` (stub or partner APIs) for ski/trip flows.
- **Client**: Extend `conciergeClient` (or add `dateInviteClient`, `tripPlanClient`) with allowlisted parameters; no raw chat sent, only structured fields.

---

## 5. Date / meet-up invite flow (detailed)

### 5.1 User story

- User is in a **1:1 chat** with a match (Romance) or connection (Friends/Business).
- They tap **“Invite on date”** / **“Invite to meet-up”** / **“Suggest meeting”** (one button; label by mode).
- A **modal or full-screen form** opens with:
  - **Suggestions** (from AI) or **manual fields**.
  - Fields: **Activity type**, **Location (city/town)**, **Specific place** (restaurant/court/venue), **Date & time**.
- **Activity suggestions** should be:
  1. **Standard**: e.g. Café, Restaurant, Bar.
  2. **From both users’ interests** (e.g. tennis, museum) or **wishlist items**.
- **Location**: Suggested city/town that works for both (e.g. midpoint or each user’s city); or user-chosen.
- **Place**: Specific venue (e.g. restaurant with cuisine, tennis court) that is **available** on the chosen date/time (later: opening hours, booking links).
- **Date & time**: User picks or AI suggests slots that fit both planners (using `get_planner_items` for both, with consent).
- User can **edit** any suggestion and **send invite**.
- **Recipient** sees the invite (in chat and/or Planner invitations) and can **Accept**, **Decline**, or **Reschedule**; or discuss in chat and then adjust.
- On **Accept**: create or update `planner_item` and `planner_participants`; optionally add to calendar; notify both.
- **Business offers**: If the user is in Romance/Friends and asks for a “date” or “dinner”, the **first suggestion** should be a Winkly partner offer when available (e.g. “Dinner for two” from a nearby restaurant).

### 5.2 Data and backend

- **planner_items**: Already have `source_mode`, `related_user_id`, `starts_at`, `ends_at`, `meta`. Use `meta` for activity type, place name, location text, offer_id (if from business offer).
- **Planner invite**: You need a way to represent “pending invite” (inviter created item, invitee not yet accepted). Options:
  - **Option A**: Add table `planner_invitations` (e.g. `planner_item_id`, `inviter_id`, `invitee_id`, `status: pending|accepted|declined|reschedule`). When invitee accepts, add them to `planner_participants` and set status.
  - **Option B**: Create `planner_item` with only creator in `planner_participants` and a `meta.invitee_id` + `meta.invitation_status`; when accepted, add invitee to `planner_participants` and clear/update meta.
- **Chat**: Send a **system or CTA message** in the conversation (e.g. “Date invite: Dinner at [Place], [Date]”) with payload linking to `planner_item_id` and invitation id so the recipient can Accept/Decline/Reschedule from chat or from Planner.
- **AI context for `date_invite_suggest`**: Allowlisted only — e.g. `mode`, `my_user_id`, `peer_user_id`, `my_city`, `peer_city`, `my_interests`, `peer_interests` (from profiles), `wishlist_titles` (both), `date_from`, `date_to`, `activity_hint`. Gateway must **not** receive full chat history; only “intent” or structured filters.

### 5.3 UI placement

- **Chat header or input bar**: Button “Invite on date” / “Invite to meet-up” / “Suggest meeting” (mode-specific label). Visible only in 1:1 DMs (not group/event chats) and when the other party is a match/connection.
- **Form**: Modal or route `chats/[id]/invite-date` with:
  - Step or single screen: Activity (dropdown + suggestions), Location (city picker or suggestion), Place (list from AI or manual), Date & time (picker).
  - “Get suggestions” uses `date_invite_suggest` with allowlisted context; show 1–3 options; user can pick one and edit.
- **Recipient**: In chat, show invite card with Accept / Decline / Reschedule. In Planner → Invitations, list pending invites with same actions (already scaffolded in `app/planner/invitations.tsx`; connect to real data).

### 5.4 Business offers first

- Introduce a **business_offers** (or **partner_offers**) table: e.g. `business_id`, `title`, `description`, `offer_type` (e.g. `dinner_for_two`), `location`, `valid_from`, `valid_to`, `meta` (link, price, etc.). RLS: readable by authenticated users; writable by business or admin.
- In **ai-gateway**, add tool `get_winkly_business_offers` (location, activity type, date range). Use it in concierge and in `date_invite_suggest` so that when activity is “dinner”/“restaurant”, the first suggestions are partner offers, then other places.

---

## 6. Trip planning (e.g. ski trip)

### 6.1 User request

- **Input**: Prompt (free text) or **form**.
- **Form fields**: Date (range), Time, Activity (e.g. skiing), Location (region/resort), “Invite people” (select from connections/friends/partner), Total budget, Other preferences (e.g. “with equipment rental”, “family-friendly”).
- AI (task `trip_plan` or `concierge` with `activity_hint: "skiing"`) should:
  - Use **my location** and **invitees’ locations** (if user consented and you store city or lat/lng).
  - Propose **destinations** (resorts) and **routes** (optional: directions API).
  - Check **weather** and **snow conditions** (Open-Meteo or specialised API) for the dates.
  - Suggest **rentals**, **hotels**, **restaurants** (Winkly partners first, then external).
  - Return a short summary and 1–3 options with links and next steps; user confirms, then can add to Planner and optionally “Invite” those people to the trip (planner_item with multiple participants).

### 6.2 Tools to add (in order)

1. **get_weather** — Already there; use for destination and date.
2. **get_winkly_events** — Already there; e.g. “ski event” or “winter trip” on Winkly.
3. **get_winkly_business_offers** — For partner ski rentals, hotels, restaurants.
4. **get_places** (or **get_poi**) — Stub then Google Places / partner: resorts, rentals, hotels. Prefer Winkly businesses.
5. **get_routes** (optional) — Directions between origin(s) and destination; e.g. Google Directions API from Edge only.
6. **Snow / conditions** — If you have a partner or API (e.g. resort APIs), add a small tool; otherwise LLM can mention “check resort website for snow report”.

### 6.3 Data and consent

- **Location**: Use allowlisted `latitude`, `longitude` or `city` from profile/session; for invitees, only if they have shared location or city in profile and consent for “trip planning” is clear in product and privacy policy.
- **Invitees**: List of user ids or “with friends/partner”; backend fetches only non-PII needed for “city” or “region” for suggestions. No chat content sent.

---

## 7. Data policies and safety

### 7.1 Principles (already in place; reinforce)

- **No PII in AI telemetry**: `ai_requests` stores only `user_id`, `mode`, `task`. No message content, no raw profile text.
- **Allowlisted context only**: Gateway accepts only predefined keys (e.g. mode, city, date_from, date_to, activity_hint, budget_tier, lat/lng, my_user_id, peer_user_id for invite; profile fields as structured lists, e.g. interests, wishlist titles). No free-form chat history unless you explicitly add a short “intent” summary and document it in privacy policy.
- **API keys**: Only in Supabase Edge Function secrets; never in the client.
- **RLS**: Tool code uses service role to read only data the user is allowed to see (own planner, events they can access, public business offers). No bypass of RLS for end-user visibility.

### 7.2 Additional for date invite and trip

- **Cross-user data**: For `date_invite_suggest`, the gateway may need to read **peer’s profile** (interests, city) and optionally **peer’s planner** (to suggest times). Ensure:
  - Only in context of “invite” (user-initiated); peer’s data is minimal (city, interests, wishlist titles, busy slots if consent).
  - Privacy policy and in-app copy state that “suggestions use your and your match’s profile and availability to propose options.”
- **Location**: Prefer city/region; precise lat/lng only if user explicitly enabled “use my location for suggestions” and you document it.
- **Minors and safety**: Align with your existing age and safety rules; AI must not suggest unsafe or age-inappropriate content.

### 7.3 Booking and payments

- If AI later “books” (e.g. reserve table) on user confirmation: use only trusted partners; store no card data in Winkly; redirect to partner or use their API with user consent. Document in terms and privacy.

---

## 8. Implementation roadmap (phased)

| Phase | What | Delivered value |
|-------|------|------------------|
| **1** | **Business offers table + tool** | AI can prioritise “Dinner for two” and partner events. |
| **2** | **Date/meet-up invite flow** | Backend: `planner_invitations` (or equivalent), CTA message in chat. Frontend: “Invite on date” button → form with manual fields first, then add `date_invite_suggest` and suggestions (activity, city, place, time). Recipient: Accept/Decline/Reschedule in chat and Planner. | Core “plan a date with match” without full AI. |
| **3** | **AI for date invite** | Task `date_invite_suggest`; allowlisted context (both profiles’ interests, cities, wishlist); `get_winkly_business_offers` + `get_winkly_events`; suggest activities, location, place, slots. | Suggestions reduce friction; partner offers first. |
| **4** | **Concierge UX** | Wire Planner and chat “Ask AI” / Spark to `callConcierge` with form (date range, activity, budget) or short prompt; show options and “Add to planner” / “Share in chat”. | Users feel “AI plans for me.” |
| **5** | **Trip planning** | Form: date range, activity (e.g. skiing), location, invitees, budget. Task `trip_plan`; tools: weather, Winkly events, business offers, optional places/routes. Return options; user adds to planner and invites. | Ski/friends/partner trip orchestration. |
| **6** | **Booking links / confirm** | For places and partners, return links; optional “book with confirmation” (user confirms, Edge calls partner API or deep link). | Reduces steps outside the app. |

---

## 9. Summary

- **AI behaviour**: Profile analysis, match/opening suggestions, event/date/meet-up/business ideas, “nothing planned” suggestions, and concierge (including trip planning) are all achievable with the **existing gateway + new tasks and tools** and **allowlisted context only**.
- **Date/meet-up invite**: Add **“Invite on date”** (or mode-equivalent) in 1:1 chat → **form** with suggested activity, location, place, date/time; **planner_invitations** (or meta) and **CTA in chat**; recipient **Accept/Decline/Reschedule**; AI suggestions via `date_invite_suggest` with **business offers first**.
- **Trip planning**: Form or prompt → task `trip_plan`/`concierge` with **weather**, **Winkly events**, **business offers**, **places** (and optionally routes); return options; user adds to planner and invites.
- **Data and safety**: **No PII in telemetry**; **allowlisted context**; **cross-user data** only for invite context and minimal; **location** and **booking** documented in privacy and terms.
- **Similar products**: Happn, Bumble, SoMe (date planning); Vail, Perfect Piste, Q Concierge (trip/concierge). Winkly differentiates with **multi-mode**, **Winkly-first (events + business offers)**, and **unified Planner + invite flow**.

Update **docs/PRODUCT_DOCUMENTATION.md** and **docs/AI_CONCIERGE_RECOMMENDATION.md** when you add new tasks, tools, or tables (e.g. `business_offers`, `planner_invitations`).
