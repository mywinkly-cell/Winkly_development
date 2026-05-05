# External Events (Meetup, Eventbrite) & Events Filtering

**Last updated:** 2026-02-23

This doc covers: (1) showing events from external platforms (Meetup, Eventbrite) on the Events home when Winkly has few native events; (2) Events filtering (day/week/month, category).

---

## 1. Why external events on the Events home

- **Cold start**: At launch there are few or no events created on Winkly. Showing events from [Meetup](https://www.meetup.com/) and [Eventbrite](https://www.eventbrite.com/) gives users something to discover immediately.
- **Winkly as orchestrator**: Users find an event on Winkly, add it to the Planner, share with others — without leaving the app for discovery. Booking/tickets still happen on the source site (link out); later you can add booking flows if needed.
- **Business promotion later**: Once you have business partners and promoted events, show those first in each category, then Winkly-created events, then external (so order is: promoted → Winkly → external).

---

## 2. Data shown for external events

For each external event we show (and store when “Add to planner”):

| Field        | Source / note |
|-------------|----------------|
| Photo       | Cover image URL from platform |
| Title       | Event name |
| Description | Short description (truncated if needed) |
| Host name   | Organizer / group name |
| Time        | Start (and optionally end) |
| Location    | Venue name + city/address |
| Link        | URL to event page (user opens to register/buy ticket) |
| Platform    | `meetup` \| `eventbrite` (for attribution and “Add to planner” meta) |

No ticket purchase through Winkly at first; user taps the link to go to Meetup/Eventbrite.

---

## 3. APIs (high level)

- **Meetup**  
  [GraphQL API](https://www.meetup.com/api/schema/): `findLocation` (lat/lon), `keywordSearch` for events. Auth: Bearer token. You can search by location and radius (e.g. ~30 km) and map results to your card shape.

- **Eventbrite**  
  [Platform API](https://www.eventbrite.com/platform/api): search by `location.address` and `location.within` (e.g. `"30km"` or city + radius). No lat/lon in response; use address for “location” and link for “link”. Auth: OAuth or private token.

**Reasonable approach:**  
- Backend (Supabase Edge Function or similar) gets user location (lat/lng or city from profile/session).  
- Calls Meetup and/or Eventbrite with that location and radius (e.g. 30 km).  
- Normalizes responses to one shape (photo, title, description, host, time, location, link, platform).  
- Returns list; app shows in category strips.  
- Respect rate limits and ToS; keep attribution (e.g. “From Meetup”) and link to original.

---

## 4. Categories (horizontal strips)

Suggested categories (aligned with Eventbrite/Meetup-style grouping):

- Music & Dancing  
- Nightlife  
- Performing & Visual Arts  
- Dating & Networking  
- Hobbies  
- Business  
- Food & Drink  

On the Events home:

- One section per category (or “Popular categories” with a strip per category).
- Each strip: horizontal scroll of cards (Winkly events first when available, then external).
- Card: photo, title, time, location, host; tap → detail (description, link, “Add to planner”, “Share”).

---

## 5. “Add to planner” for external events

- When user taps “Add to planner” on an external event, create a **planner_item** (or “saved event”) with:
  - `source_mode`: `events`
  - `title`, `description`, `starts_at`, `ends_at`, `meta`:
    - `meta.external_url`: link to Meetup/Eventbrite
    - `meta.external_platform`: `meetup` | `eventbrite`
    - `meta.external_id`: optional id on the platform
    - `meta.location`, `meta.image_url`, `meta.host_name` for display
- So the Planner shows it like any other event and user can open the link from there.

---

## 6. Events filtering (day / week / month, category)

- **Time range**: Same idea as Planner — view by **day**, **week**, or **month**; optional **date picker** to jump to a specific date/week/month.
- **Category / activity**: Filter by category (Music, Nightlife, Business, etc.) and optionally by activity type.
- Implementation: Events home (and any list/feed) accepts `range` (day | week | month), `date` (selected date), `category` (optional). Pass these to:
  - Winkly events API (filter `starts_at` and category if stored).
  - External events Edge Function (same range/date/category so results match the chosen period and category).

---

## 7. Implementation status

- **Events home**: Category strips and filter bar (day/week/month, category) are wired in the app; “Winkly events” and “External events” are structured so you can plug real APIs.
- **Edge Function**: `get-nearby-external-events` (or similar) is the place to call Meetup/Eventbrite, normalize, and return; add API keys in Supabase secrets when ready.
- **Add to planner**: Reuse existing planner_item creation with `meta` for external_url, platform, etc.

---

## 8. Summary

- Showing **external events** (Meetup, Eventbrite) on the Events home is **reasonable and useful** for cold start and positions Winkly as the place to discover and plan; booking stays on the source site at first.
- Use **category strips** (Music, Nightlife, Arts, Dating & Networking, Hobbies, Business, Food & Drink); later order: promoted → Winkly → external.
- **Filtering** by day/week/month and category matches the Planner experience and keeps Events easy to scan.
