# Concierge — prompt structure (Planner vs Chat)

**Purpose:** Reference for what gets **generated on the client** and **sent to Gemini** when the user taps **Generate a plan**. Aligned with `lib/ai/buildPlanRequestText.ts`, `ConciergeContext` in `lib/ai/conciergeClient.ts`, and `conciergeUserMessage()` in `supabase/functions/ai-gateway/index.ts`.

**Last updated:** 2026-04-08

---

## Phase A vs Phase B (product scope)

| Phase | Scope | Profile data sent to the LLM |
|-------|--------|-------------------------------|
| **A (current)** | **1:1 chat** (DM) and **Planner** — solo or **one** co-planner (`partner_user_id`). | **`profiles_core`** (general: age, gender, city, …) + **`profiles_mode` for the active `mode` only** for you and optionally one partner. Gateway: `getConciergeProfileContext` + **`summarizeModeProfile(mode)`** so goal fields are mode-appropriate (no cross-mode meta leakage). |
| **B (planned)** | **Group chat** — plan a meetup for **several** members (cap e.g. 6–8). | For **each** selected participant: same rule — **general + sub-profile for the chat’s mode only** (Friends group → Friends row + core; Business group → Business row or `profiles_business` + core; never Romance-only fields). Implemented as allowlisted `participant_user_ids[]` + compact **`GROUP_MEMBERS`** (or similar) in **ai-gateway**. |

---

## 1. Three layers (how it fits together)

| Layer | What it is | Where |
|-------|------------|--------|
| **A) `plan_request_text`** | One natural-language block = “what the user would paste into Gemini” from the form (mode, origin/destination, topic, time incl. optional **HH:mm**, budget, weather, **sanitized requester persona**, who joins). | Built in the app; **authoritative for the brief** when present. |
| **B) JSON context (`rest`)** | Same session’s fields **minus** `plan_request_text` (mode, dates, city, `partner_user_id`, `planning_entry_surface`, `origin_location_label`, `exact_time_hm`, `sanitized_requester_persona`, `weather_snapshot`, etc.) for tools and server logic. | Sent inside the user message string below. |
| **C) Server-enriched context** | Not in the client request body: `PRIMARY_USER`, optional `PARTNER_USER`, Winkly candidates, etc. injected by `ai-gateway` before calling the model. | **ai-gateway** only. |

The model also receives a **system prompt** (concierge rules, JSON shape, safety). This doc focuses on the **user-side request** (A + B).

---

## 2. User message sent to the model (when `plan_request_text` is set)

```text
USER_REQUEST (what the user filled in the app — treat as their exact prompt to you):

<plan_request_text>

---
Task: concierge. Structured context (for tools; weather is in weather_snapshot when present): <JSON.stringify(rest)>
```

---

## 3. Input template — `plan_request_text` (verbatim block)

Fields in `<angle brackets>`; optional lines omit when empty.

```text
Mode: Planner (planning context: <romance|friends|business|events>).   |   Mode: <romance|friends|business|events>.
Topic / activity: <topic>.
Current location (origin): <City, Country | "not set separately — assume destination area">.
Destination / plan area: <City, Country | Location not specified.>.
Travel time & distance: <precomputed summary or instruction to estimate; shared plans → per-recipient routing later>.
Venue hint: <name — open hours text>   |   (omit if none)
Date: YYYY-MM-DD. | Dates: … | Date: not specified.
Time of day: <any | Morning | …> | When I'm free: …
Exact start time (local, single day): HH:mm   |   (omit if not set)
Budget: …
Weather (from the app for my destination area and dates—use this; do not substitute another city/day): …
Requester persona (sanitized — no name, email, phone): <age, area, interests, lifestyle, goals — from formatSanitizedPersonaForConciergePrompt + PRIMARY_USER on server>
Planning with: <partner display name> | Who joins: not specified…
Additional notes: …

Constraints — verify together before finalizing options: (1) Date and time fit the user’s request. (2) Weather suits the activity. (3) Venue opening hours must contain the requested arrival time — avoid arriving near closing unless short visit. (4) If anything conflicts, say so and suggest adjustments.

Output: suggest exactly three concrete plan options as JSON in the required schema. For EACH option include fields aligned with: Topic/activity; Place; Name of place; Google Maps link when grounded; opening hours when known; date/time; hours vs requested time; budget; weather fit; booking links when real (never fabricate URLs). If a constraint cannot be satisfied, explain and offer alternatives.
```

**Mode line rules**

- **`Planner (planning context: X)`** when `planningEntrySurface === "planner"` (Planner hub / flow).
- **`Mode: <mode>`** when opened from **Chats** (or mode-only context).

**Places**

- **Origin** = current / device location when captured (Planner activity step stores first GPS line; Chats form fetches GPS on submit for origin line).
- **Destination** = plan area (city/country) for weather + venue search.
- **Travel** = optional future **Distance Matrix** / Maps; until then the template asks the model to estimate and to note per-participant differences when sharing.

**Time**

- **Part of day** chips as before.
- **Exact `HH:mm`** when single-day and user enables “Set exact start time” (Planner Step 2).

**Persona**

- Client builds **`formatSanitizedPersonaForConciergePrompt`** from `loadPlanningProfileContext` (age, city, interests, lifestyle, goals — **no** name, email, phone).
- Server still sends **`PRIMARY_USER`** / **`PARTNER_USER`** for the same minimization rules.

---

## 4. Output template — each option (what we ask the model to return)

For every option, narrative + JSON should cover (when applicable):

```text
Topic / activity: <topic>.
Place: <City, Country | full address | Location not specified>.
Maps: <Google Maps URL only when grounded — never invented>.
Venue name: <name>.
Opening hours: <text or hours>; vs requested time: <fits | conflict; suggest change>.
Date: … | Dates: …
Time of day: … | Exact time: HH:mm (single day)
Budget: …
Weather fit: <how forecast matches the activity>
Planning with: …
Additional notes: …
Links: <official booking / tickets when available> — never fabricate.
```

The **ai-gateway** system prompt adds feasibility rules (weather vs outdoor, hours vs arrival, no fake URLs).

---

## 5. `origin_context` labels (analytics)

From `buildOriginContext()`:

- **Planner:** `Planner_<TabLabel>`
- **Chat with partner:** `Chat_1:1_<Mode>`
- **Chat without partner:** `Chat_<Mode>`

---

## 6. Code references

- `buildPlanRequestText` — `apps/mobile/lib/ai/buildPlanRequestText.ts`
- `formatSanitizedPersonaForConciergePrompt` — `apps/mobile/lib/ai/customPlanPresets.ts`
- `ConciergeContext` — `apps/mobile/lib/ai/conciergeClient.ts`
- `conciergeUserMessage` / `CONCIERGE_SYSTEM_PROMPT` — `supabase/functions/ai-gateway/index.ts`
- `buildOriginContext` — `apps/mobile/lib/ai/conciergeClient.ts`
