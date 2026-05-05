# “Let’s do something” — Invite-to-activity flow

**Last updated:** 2026-03-09

This doc describes the **invite-to-activity** killer mechanic and how it fits with the existing AI agent and invite flow.

---

## 1. The idea

**Problem:** Matches often chat endlessly and never meet.  
**Solution:** Turn “Invite on date / meet-up / meeting” into a **one-tap → pick activity → get suggestion → send** flow.

### Target flow

1. User taps **“Invite to activity”** (or “Let’s do something”) in a 1:1 chat.
2. **Activity options** appear:
   - ☕ Coffee · 🍷 Wine · 🎾 Tennis (from mutual interests) · 🚗 Day trip · 🎶 Concert · 🍽 Dinner · 🚶 Walk  
   (Mode-specific: Romance/Friends get the full set; Business gets Coffee, Lunch, Meeting, etc.)
3. The invitation **automatically**:
   - **Suggests places** (via AI / Concierge)
   - **Suggests times** (e.g. tomorrow 18:00)
   - **Creates chat** (invite is sent as a CTA message in the existing conversation)
   - **Adds to planner** (planner item + planner_invitation; recipient can Accept / Decline / Reschedule)

**Example:** Instead of “Hi, how are you?” the app suggests **“Coffee at Café Luitpold tomorrow at 18:00?”** — changing the dynamic from chat to a concrete plan.

---

## 2. How it fits the current stack

| Piece | Current state | Role in “Let’s do something” |
|-------|----------------|-------------------------------|
| **InviteToPlanModal** | Manual form: activity chips, location, place, date/time. No AI. | Add activity list (Coffee, Wine, Tennis, …), **“Get suggestion”** that calls Concierge and pre-fills place + time. |
| **Concierge** | Full-screen: request → options → confirm; can “Send selection & invite [Partner]”. Has `partner_user_id`, `activity_hint`, `source_screen`. | Used **inside** the invite flow: when user picks an activity and taps “Get suggestion”, call `callConcierge` with partner + activity + date range; parse first option into place + time and pre-fill the form. |
| **Planner invitations** | `createPlannerInvite` + CTA message in chat; Accept/Decline/Reschedule. | Unchanged. “Send invite” still creates planner item + invitation and sends CTA. |
| **Chat** | “Invite on date” in ⋯ menu opens InviteToPlanModal. | Pass **partner** (user id, display name) into the modal so “Get suggestion” can use Concierge with partner context. Optionally surface “Invite to activity” more prominently (e.g. quick action). |

See **docs/AI_INTEGRATION_AND_DATE_INVITE_RECOMMENDATION.md** for backend (`date_invite_suggest`, planner_invitations, business offers) and phased roadmap.

---

## 3. Recommended implementation options

### Option A — Enhance InviteToPlanModal (recommended first step)

- **Activity list:** Extend chips to the “killer” set: Coffee, Wine, Tennis, Day trip, Concert, Dinner, Walk (plus mode-specific variants).
- **“Get suggestion”:** Button in the modal that:
  - Calls `callConcierge({ task: "concierge", context: { mode, activity_hint: selectedActivity, partner_user_id, date_from, date_to, source_screen: "chats", city, country } })`.
  - Takes the first suggestion and parses **place** and **time** from `option_name` / `narrative` / `itinerary` (or schedule).
  - Pre-fills **Place** and **Date & time** in the form; user can edit and tap **Send invite**.
- **Partner context:** Chat passes `partnerUserId` and `partnerDisplayName` into the modal so Concierge can use partner context (and later mutual interests for e.g. Tennis).
- **Gating:** Show “Get suggestion” only when user has Concierge access (`canUseAIFeature(tier, "concierge")`). Free users still use the same modal with manual entry.

**Pros:** Reuses existing Concierge and planner invite flow; no new backend task required for first version.  
**Cons:** Concierge response format is richer than “one place + one time”; parsing is heuristic until ai-gateway has a dedicated `date_invite_suggest` that returns structured place + time.

### Option B — Concierge as the main “Invite to activity” path

- In chat, add a clear entry: “Plan something with [Name]” that opens the **full Concierge screen** with partner and conversation pre-filled (e.g. “coffee with match”).
- Concierge already supports “Send selection & invite [Partner]” in the confirm step.
- Optionally add a **shortcut row** in Concierge form: Coffee, Dinner, etc. that set `activity_hint` and optionally `user_prompt`.

**Pros:** One flow, full AI flexibility.  
**Cons:** Heavier (full-screen); less “one tap → one suggestion → send”.

### Option C — Hybrid (activity picker → Quick suggest or Full Concierge)

- **First step:** “Invite to activity” opens a **bottom sheet** with the 7 activities. User taps one.
- **Second step:**  
  - **“Get suggestion”** → call Concierge (or future `date_invite_suggest`) for that activity → show **one card** (“Coffee at Café Luitpold tomorrow 18:00”) → user taps **Send** or **Edit** (edit opens InviteToPlanModal pre-filled).  
  - **“Choose details”** → open InviteToPlanModal with that activity pre-selected (manual or then “Get suggestion” inside modal).
- Send reuses `createPlannerInvite` + CTA.

**Pros:** Matches the “one tap → pick activity → one suggestion” mental model; still allows full control.  
**Cons:** More UI (sheet + card step); can be introduced after Option A.

---

## 4. Recommendation summary

- **Short term:** Implement **Option A**: expand activities in **InviteToPlanModal**, add **“Get suggestion”** that uses **Concierge** with partner context and pre-fills place + time; pass partner from chat. Gate “Get suggestion” on Concierge access.
- **Next:** Consider **Option C** (activity-first sheet, then one-tap suggest card) for maximum “Let’s do something” impact, and/or add **`date_invite_suggest`** in ai-gateway for a focused “place + time” response and mutual-interests (e.g. Tennis).
- **Product copy:** Surface “Invite to activity” or “Let’s do something” in chat (e.g. in the ⋯ menu and/or as a quick action) so the mechanic is discoverable.

---

## 5. Super like with invite (Romance discover)

**Idea:** When viewing a card, paid users can send a **Super like with a concrete invite** (e.g. “Hi [Name]! How about coffee at Café Luitpold on Sun 15 Mar at 13:30?”) instead of only text. That increases the chance of a real meeting and saves planning time. If they match, the chat is created and they can confirm place, date and time (with AI suggestions based on both profiles).

### Implemented (Phase 1)

- **Discoverability in chat:** A clear **“Invite to activity”** button (calendar icon) in the **composer row** of 1:1 chat, next to the image and emoji buttons. Tapping it opens **InviteToPlanModal**. The ⋯ menu still has “Invite on date” / “Invite to meet-up” etc.
- **Super like with invite (Romance):** When the user taps the **Super like** (star) button on a card, the intent modal offers:
  - **Add a message (optional)** — existing flow: AI icebreaker or custom text.
  - **Send with an invite (place & time)** — opens **SuperLikeInviteModal**: pick activity, optional **“Get suggestion”** (Concierge with `partner_user_id` = card user) to pre-fill place and time, then **“Send Super like with invite”**. The invite is sent as the **super_like_message** (e.g. “Hi [Name]! How about coffee together on Sun 15 Mar at 13:30 at Café Luitpold?”). The recipient sees it when they see the sender’s card in **Matches → Pending**. No planner invitation is created yet; when they match, the chat is created and they can send a full planner invite from chat to confirm.
- **First-date safety (Super like with invite):** Because this is a **first-meet** context (pre-match or first date), the activity list is **safe-only**: public, low-commitment options (Coffee / Café, Brunch / Lunch, Dinner, Wine / Drinks, Concert, Movie, Walk (e.g. daytime), Other). **Excluded** for this flow: day trips, isolated settings, or activities that suggest late-evening or private settings (e.g. park late at night). The modal shows the hint: *“Suggestions are public, daytime or busy spots — comfortable for a first meeting.”* Default time is afternoon (13:30). This is especially important for women and anyone who prefers a low-risk first meeting.
- **Concierge:** “Get suggestion” in SuperLikeInviteModal is gated on Concierge access (Premium). Users without it can still send a Super like with invite by entering place and time manually.

### Possible Phase 2 (backend)

- Store **structured invite** (e.g. `super_like_invite` JSONB on `romance_likes`) with activity, place, address, `starts_at`. When the recipient **matches**, backend or client creates a **planner_invitation** and posts a CTA message in the new chat so they can Accept / Decline / Reschedule from chat or Planner.
- **AI:** Use both users’ locations, place rating (e.g. Google), and opening-hours check so the suggested place fits both and is available. (May require new tools in ai-gateway.)

When you add or change flows, update **docs/PRODUCT_DOCUMENTATION.md** (navigation, features) and **docs/AI_INTEGRATION_AND_DATE_INVITE_RECOMMENDATION.md** (tasks, tools).
