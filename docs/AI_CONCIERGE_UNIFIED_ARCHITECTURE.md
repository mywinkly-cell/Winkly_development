# AI Concierge — Unified Architecture

**Last updated:** 2026-02-22

This document defines the **AI Concierge Unified Architecture**: the bridge between static User DNA (onboarding), Sub-Mode Context (Romance, Friends, Business, Events), and Real-Time World Data (weather, maps, business availability). It aligns with the existing **AI_CONCIERGE_SPEC.md** and mobile implementation.

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

- **Weather warning:** If rain is forecast for the chosen date/location, a "Concierge note" box appears: *"Note: [date] is forecast for rain in [city]. Consider indoor options or another day."* with actions: **Postpone a day** | **Change activity** (e.g. add "indoor" to prompt).
- **Constraint conflict** (e.g. partner allergy) and **time logic** (traffic) are backend-driven; response can include `concierge_note` for display. Target latency for client-side weather hint: **&lt;1.5 s** after date/location set.

### Screen C: The Menu Options (Result)

After Submit, the AI returns **2–3 Menu Cards**. Each card includes:

- **Title** (option_name / narrative)
- **Why it fits your DNA** (why_this_fits / logic_bridge)
- **Itinerary / schedule** (itinerary steps or schedule array)
- **Travel time, price tier** (logistics, price_indicator)
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

Real-time triggers (weather, traffic, business_partners) are handled by the gateway (tools: get_weather, get_winkly_events, get_planner_items); client may send pre-fetched `weather_snapshot` to avoid extra round-trips.

### Response

- **message:** Human-readable summary.
- **suggestions:** 2–3 ExperienceOption (option_name, why_this_fits, itinerary/schedule, logistics, price_indicator, business_link).
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
| **Postpone** / **Change activity** | Shown in Real-Time Advisory when weather/conflict detected. |
| **Send selection** / **Add to planner** | ConciergeConfirmStep primary CTA; optional "Invite [Partner]". |
| **Correct details** | Refinement chips or free text; re-submit with refinement_feedback + previous_options. |

---

## 7. Implementation References

- **Client:** `lib/ai/conciergeClient.ts` (`buildOriginContext`, `ConciergeContext.origin_context`, `ConciergeResponse.concierge_note`).
- **Form:** `components/ai/ConciergeRequestForm.tsx` (mode label, activity chips, real-time advisory box, location placeholder, refinement placeholder).
- **Confirm step:** `components/ai/ConciergeConfirmStep.tsx` ("Why it fits your DNA", Correct details refinement, Send selection).
- **Planner modal:** `app/planner/index.tsx` (refinement state, previous_options, onCorrectDetails).
- **Spec:** `docs/AI_CONCIERGE_SPEC.md` (constraint intersection, persona, menu schema, business priority).
