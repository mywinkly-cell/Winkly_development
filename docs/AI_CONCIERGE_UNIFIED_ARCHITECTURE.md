# AI Concierge — Unified Architecture

**Last updated:** 2026-06-14

This document defines the **AI Concierge Unified Architecture**: the bridge between static User DNA (onboarding), Sub-Mode Context (Romance, Friends, Business, Events), and Real-Time World Data (weather, maps, business availability). It aligns with the existing **AI_CONCIERGE_SPEC.md** and mobile implementation.

> **Reality check (2026-06):** The Planner and chat "Plan together" surfaces use the 7-step **`ConciergePlanningFlow`** → task **`planner_theme_plans`** → **2 decisive A/B options** (Super+). The full **3-option** Experience Menu is the Premium chat-assist `concierge` task only (`ConciergeRequestForm`). The Planner results step carries an in-flow upsell to the deeper concierge. AI copy is localized via `app_language`.

---

## 1. Functional Overview: The "Ambient Intelligence"

The AI Agent is a **layer** across three main surfaces:

| Surface | Role | Behavior |
|--------|------|----------|
| **Planner** | The "Architect" | Structured, proactive creation: form → real-time advisory → menu options → add to planner / send invite. |
| **Chats** | The "Facilitator" | Spontaneous, collaborative suggestions: conversation starters, date ideas to suggest in chat, optional partner. |
| **Global** | The "Concierge" | Open-ended natural-language requests (same form, `origin_context` drives backend behavior). |

Client sends **origin_context** (e.g. `Planner_Romance`, `Chat_1:1_Romance`) so the gateway can apply mode-specific filter weights and priorities.

---

## 2. Planning Screens & UI Flow

### Screen A: The Intelligent Planning Form

When the user opens "Ask Winkly AI" from the **Planner** (or "Winkly AI for Chats" from Chats), they see a dynamic form.

| Field | AI Behavior |
|-------|-------------|
| **Mode** | Auto-set from current sub-tab (Dates → Romance, Meet-ups → Friends, etc.). Shown as "Planning for: [mode]" label; toggleable in future. |
| **Who** | If opened from 1:1 chat, partner can be auto-selected (future). "With whom" / "For which match or connection" picker; AI receives `partner_user_id` for constraint intersection and DNA alignment. |
| **Activity / Prompt** | Free-text ("Dinner at the lake") plus **Quick-Select chips** per mode (Romance: Dinner date, Coffee together, …; Friends: Brunch, Sports, …; Business: Coffee chat, Lunch meeting, …; Events: Concert, Workshop, …). |
| **Time / Date** | Date picker; real-time validation. Weather and advisory use this for feasibility. |
| **Location** | Default "Current city" when profile city is set; or specific city. Weather fetched for date + location. |

### Screen B: The Real-Time Advisory (Hint Layer)

As the user fills the form, **active feedback** appears before Submit:

- **Weather warning:** If rain is forecast for the chosen date/location, a "Concierge note" box appears with actions **Postpone a day** | **Prefer indoor**. As of 2026-06 this lives in the **Planner step `ConciergeActivityDetailsStep`** (it reads the `weatherSnapshot` already fetched there): "Postpone a day" shifts the date +1; "Prefer indoor" sets `indoorOutdoor = "indoor"` so the plan request asks for indoor venues. (The legacy copy in `ConciergeRequestForm` was unreachable for Planner opens — that form only renders for chat, non-`usePlanningFlow` entry — so it was removed.)
- **Constraint conflict** (e.g. partner allergy) and **time logic** (traffic) are backend-driven; response can include `concierge_note` for display. Target latency for client-side weather hint: **&lt;1.5 s** after date/location set.
- **Proactive pivot (post-confirmation):** Separately, `weather-pivot-cron` re-checks weather ~24h before a *confirmed* plan and, if severe, proposes an indoor alternative surfaced by `WeatherPivotBanner` in the Planner. **Confirming the pivot UPDATES the original plan in place** — `pending-plan-confirm` rewrites the existing `planner_items` + `confirmed_events` row (same ids/`event_uid`, new indoor content; original preserved under `meta.weather_pivot`) rather than creating a second Planner entry or calendar event. See §7.

### Screen C: The Menu Options (Result)

The number of cards depends on the surface (see the reality-check note above):

- **Planner / "Plan together"** (`planner_theme_plans`, Super+): **2 decisive cards (A/B)** — Maps-verified venue, `why_this_fits`, itinerary, weather note — plus an in-flow **Premium upsell** to the full menu.
- **Chat assist** ("Winkly AI for Chats", `concierge`, Premium): the full **3-card Experience Menu**.

Each card includes:

- **Title** (option_name / narrative)
- **Why it fits your DNA** (why_this_fits / logic_bridge)
- **Itinerary / schedule** (itinerary steps or schedule array)
- **Travel time, price tier** (logistics, price_indicator — chat-assist `concierge` shape only)
- **Send selection** → Add to planner and optionally **Invite [Partner]** (ConciergeConfirmStep: "Send selection & invite …" / "Add to planner").
- **Correct details** → Refinement: chips ("Make it cheaper", "Earlier time", "More relaxed", "Different cuisine") or free text; re-submit with `refinement_feedback` and `previous_options` for delta logic.

---

## 3. Mode-Specific Intelligence (Sub-Tab Logic)

The AI adjusts **filter weights** by **origin_context** and **source_planner_tab**:

| Sub-Tab | AI Focus & Priorities |
|---------|------------------------|
| **All (Generic)** | Mix of solo/group; personal lifestyle and city habits. |
| **Romance (Dates)** | relationship_goals; intimacy, aesthetics, hidden gems. |
| **Friends (Meet-ups)** | meetup_goals; group capacity, noise tolerance, shared interests. |
| **Business** | networking_goals; quiet for talk, Wi‑Fi, proximity to tech/biz hubs. |
| **Events** | Lifestyle / spontaneous; what’s happening now (real-time data). |

Client sends `origin_context` (e.g. `Planner_Romance`, `Planner_Events`) and `source_planner_tab`; gateway uses these in the system prompt and tooling.

---

## 4. Contextual Chat Integration (Roadmap)

- **1:1 and group chat hints:** Passive listening (e.g. "Tennis" + "Thursday" in chat) → AI icon glow → pre-filled Planning Form. *(Future.)*
- **@AI in chat:** User types "@AI Suggest a place nearby" → AI analyzes last N messages + both profiles → 3 options. *(Future.)*

---

## 5. Technical Payload (Engineers)

### Context sent to ai-gateway

- **origin_context:** `Planner_[Romance|Friends|Business|Events|All]` or `Chat_1:1_[Mode]` / `Chat_[Mode]`.
- **users:** Inferred from session + `partner_user_id` (gateway fetches profiles).
- **intent:** `user_prompt` / `activity_hint`, `city`, `date_from` / `date_to`, `budget_tier`, `weather_snapshot`, `refinement_feedback`, `previous_options`.
- **app_language:** App UI language code (e.g. `de`); allowlisted so AI copy is returned in the user's language (default English).

Real-time triggers (weather, traffic, business_partners) are handled by the gateway (tools: get_weather, get_winkly_events, get_planner_items); client may send pre-fetched `weather_snapshot` to avoid extra round-trips.

### Response

- **message:** Human-readable summary.
- **suggestions / plan_options:** Chat-assist `concierge` returns **3** `ExperienceOption` (option_name, why_this_fits, itinerary/schedule, logistics, price_indicator, business_link). Planner `planner_theme_plans` returns **2** `plan_options` (A/B: title, why_this_fits, itinerary, venue, weather_note) — no `logistics`/`concierge_tip`.
- **concierge_note:** Optional real-time advisory (e.g. constraint conflict, time logic) for the hint layer.

### Conflict & logic resolution (gateway)

- Safety: exclude venues conflicting with allergies/diet (from profiles).
- DNA match: compatibility between users’ interests and values.
- Feasibility: weather; if "open air" + rain → weather-proof pivot (e.g. glass-enclosed terrace).
- Business priority: query business_profiles first before general places.

---

## 6. User Actions & Buttons

| Action | When |
|--------|------|
| **Plan with AI** | Opens the intelligent form (Planner header Spark). |
| **Get chat suggestions** | Same form from Chats; chat-focused copy and optional details. |
| **Postpone a day** / **Prefer indoor** | Shown in the Planner step (`ConciergeActivityDetailsStep`) when rain is forecast for the chosen date/location. |
| **Use indoor plan** / **Keep original** | `WeatherPivotBanner` in the Planner, when `weather-pivot-cron` proposes an indoor pivot for a confirmed plan. |
| **Send selection** / **Add to planner** | ConciergeConfirmStep primary CTA; optional "Invite [Partner]". |
| **Correct details** | Refinement chips or free text; re-submit with refinement_feedback + previous_options. |

---

## 7. Implementation References

- **Client:** `lib/ai/conciergeClient.ts` (`buildOriginContext`, `ConciergeContext` incl. `app_language`, `getPendingWeatherPivots` / `dismissWeatherPivot`, `ConciergeResponse.concierge_note`).
- **Planner flow:** `components/ai/ConciergePlanningFlow.tsx` (7-step flow → `planner_theme_plans`, 2 A/B cards, Premium upsell).
- **Planner step / weather advisory:** `components/ai/ConciergeActivityDetailsStep.tsx` (Weather row + Postpone a day / Prefer indoor).
- **Chat assist form:** `components/ai/ConciergeRequestForm.tsx` (chat-only; mode label, activity chips, refinement placeholder).
- **Weather pivot:** `supabase/functions/weather-pivot-cron/index.ts` + `migrations/20260625120000_weather_pivot_cron_schedule.sql` + `components/planner/WeatherPivotBanner.tsx`.
- **Confirm step:** `components/ai/ConciergeConfirmStep.tsx` ("Why it fits your DNA", Correct details refinement, Send selection).
- **Spec:** `docs/AI_CONCIERGE_SPEC.md` (constraint intersection, persona, menu schema, business priority).
