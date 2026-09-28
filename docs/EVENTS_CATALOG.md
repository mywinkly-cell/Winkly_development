# Events catalogue, Planner plans and the Wishlist

**Last updated:** 2026-09-28

## 1. Two meanings of "event"

| Word in the app | What it is | Where it lives |
|---|---|---|
| **Plan** | Something *you* do: a date, a meetup, a business meeting, or just you. Made with Winkly AI or typed in yourself, like in a calendar. | Planner (`planner_items`) |
| **Event** | Something *happening out there* that anyone can attend (concert, tour, workshop…). An **idea** for a plan. | Events mode catalogue |

Private users don't create events. They create **plans** in the Planner (`+` button → `app/plan/new.tsx`). Publishing public events is for **business accounts** (the "Create event" entry is only shown when `account_type = business`).

## 2. Events mode = one catalogue instead of five apps

`app/(modes)/events/index.tsx`, backed by the `get-nearby-external-events` Edge Function.

- **Sources** (each runs only when its secret is set):

  | Secret | Platform | Notes |
  |---|---|---|
  | `TICKETMASTER_API_KEY` | Ticketmaster Discovery API | Free key, primary source. Gives prices. |
  | `MEETUP_API_KEY` | Meetup GraphQL | Needs Meetup Pro. |
  | `EVENTBRITE_PRIVATE_TOKEN` | Eventbrite | Public search is restricted by Eventbrite. |
  | `GETYOURGUIDE_API_KEY` | GetYourGuide Partner API (tours & activities) | Needs partner approval. The adapter is defensive; check field names and the picture `[format_id]` against the partner docs once the key is issued. |

- **Pre-filtered for you.** The app sends your own interest tags (from `profiles_mode.interests`, nothing else) and your location, or a city you typed. The function ranks items and returns `match` reasons ("You like jazz · 2 km away · Happening soon"), which the card shows.
- **Filters:** where (near me / any city), when (day / week / month + date), **type of place** (`music`, `nightlife`, `theatre`, `museum`, `food`, `outdoor`, `sports`, `workshop`, `tour`), and search.
- **Duplicates merged.** The same event on several platforms becomes **one item** with `offers[]` (platform, link, price), cheapest first, like hotel booking sites in Google Maps. The details screen (`catalog-item.tsx`) lists every booking option with its price. The logic is in `supabase/functions/_shared/events/catalog.ts` (tests: `__tests__/eventCatalog.test.ts`).
- **"+ Plan"** on any card opens the new-plan form pre-filled (title, time, place, photo, booking links); you choose *Just me / Date / Meetup / Business*. **"Save place"** puts the venue in the wishlist.
- Events published on Winkly (business accounts) show in an "On Winkly" strip at the top.

## 3. Sponsored venue offers (no business account needed)

Paid placements, like sponsored cards in dating apps. Venues don't need a Winkly account: the Winkly team manages rows in **`sponsored_venue_offers`** (Supabase dashboard → Table editor, service role).

| Column | Meaning |
|---|---|
| `venue_name`, `title`, `description`, `price_label` | What the card says (e.g. "−20 % on cocktails, Mon–Thu") |
| `image_url` *(https)* or `place_id` | Photo (Google place photo if no image) |
| `link_url` *(https)* + `cta_kind` | Button: `visit` / `book` / `menu` / `offer` |
| `city` (+ optional `latitude`, `longitude`, `radius_km`) | Where it's shown |
| `venue_type`, `interest_tags[]` | Targeting (matched against the selected type and the user's interests) |
| `starts_at`, `ends_at`, `active`, `weight` | Run window, on/off, priority (1–100) |
| `sponsor_id` | Optional link to `spark_sponsors` (who paid) |

- Users only ever read `active` rows inside their run window (RLS). At most 2 per list: after the 3rd card, then every 8. Always labelled **"Sponsored"**.
- **Reporting:** `sponsored_offer_events` records `impression`, `tap`, `save` and `plan` per offer (insert-own only; read with the service role), e.g.
  `select kind, count(*) from sponsored_offer_events where offer_id = '…' group by kind;`

## 4. Planner

- **`+` button** (bottom right) → `app/plan/new.tsx`: title, who it's for, date / start / optional end, place, notes. Winkly AI is one tap away ("Need ideas? Ask Winkly") but never required. Saving creates the planner item (+ calendar sync). From a chat's **Plan together**, the chat's own invite form opens instead of "create event".
- **Photos everywhere.** Planner cards, AI plan options and Weekly Spark cards show the venue's picture (`components/ui/VenuePhoto.tsx`). Source priority: saved image → Google `place_id` → venue name + city lookup.
- **Wishlist icon** (bookmark, left in the Planner header) → `/wishlist`.

### Venue photos without leaking the Google key

`place-photo` Edge Function: `?place_id=…` or `?name=…&city=…` → the image, streamed through (no redirect, so neither the Google key nor the user's token leaves Winkly) (`&format=json` returns the photographer credit Google requires; the app shows it on large photos). Photo *references* are stored in `verified_places.photos`; free-text lookups are cached in `place_lookup_cache`, so each venue is looked up once. Needs `GOOGLE_PLACES_API_KEY`. Cost note: each new venue name costs one Places Text Search (then cached), and each photo view is a Places Photo request (the app caches images for a day).

## 5. Wishlist

Places you want to go: saved from a reel, a friend's tip, an event venue.

- `/wishlist`: grid with photos, *To visit / Visited*, city filter, search. Add / edit / delete; "Plan a visit"; "Mark as visited".
- **Paste a link** (Instagram, TikTok, Google/Apple Maps): Maps links fill in the name and coordinates (`lib/wishlist/sharedLink.ts`). `/wishlist/create?url=…` / `?text=…` pre-fills from a shared link, which is ready for a native "Share to Winkly" extension.
- **Sharing is per mode** (Identity Firewall): each place, or the whole list (`wishlist_sharing_settings`), can be shared with *My dates* / *My friends* / *Business contacts*. A shared place is visible only to people you have an **active chat with in that mode**, never to blocked users. Read path: `get_shared_wishlist_items(owner_ids, mode)`. Tested by `supabase/tests/wishlist_sharing_test.sql` (runs in CI).

### Wishlist × Winkly AI

When you plan with Winkly AI (`winkly_plan`, `planner_theme_plans`), ai-gateway loads **your** open wishlist places plus the **partner's places shared in that mode**, keeps the ones in the plan's city (`_shared/wishlist/planning.ts`), and:

1. gives them to the model as `WISHLIST_PLACES`. It may build option A around one (`wishlist_ref`), which becomes `from_wishlist` on the option (badge "From your wish list" / "On both your wish lists" / "From their wish list");
2. returns them as `wishlist_suggestions`. The app shows *"Hey, there are places you saved — how about visiting X?"* above the options, with "Plan this" to re-plan around one.

Only names/areas go to the model (no user ids or links). The `planner_theme_plans` cache key now includes the requester, so private wishlist places never leak through the shared cache.

## 6. Plans → Planner → calendars (audit 2026-09-28)

Every way a plan starts or ends goes through `lib/plannerInvitations.ts` / `lib/integrations/plannerCalendars.ts`:

| How | Planner | Phone calendar (iCloud / Google / Outlook / Samsung… accounts on the phone) | Connected Google / Outlook (server) |
|---|---|---|---|
| "+ New plan", AI plan, Weekly Spark, "+ Plan" from Events | ✅ | ✅ | ✅ |
| Chat invite: sender / invitee accepts | ✅ / ✅ | ✅ / ✅ | ✅ / ✅ |
| AI group plan confirmed by everyone | ✅ | ✅ on each phone the next time the Planner opens (catch-up) | ✅ |
| **Join / Interested** on a Winkly event | ✅ (own entry, `related_event_id`) | ✅ | ✅ |
| Not going / Leave event | → Archive | removed | removed |
| Cancel a plan | → Archive (stays there after reload) | removed | removed (organiser cancelling removes everyone's copies) |
| Restore a cancelled plan | back | re-added | re-added |

- The phone calendar is **opt-in** (privacy). The first time a plan is created or accepted, Winkly asks once ("Add plans to your calendar?"); it can be changed in Planner settings, where Google / Outlook are connected too.
- Removal: `calendar-sync-confirmed-event` with `action: "remove"` deletes the Google/Microsoft events Winkly created. The sync and the retry sweep never re-add a cancelled plan.
- Not covered yet: when a plan's **time changes** (weather pivot, reschedule), existing calendar events are not moved.

## 7. Wishlist: sharing with specific people

Besides "share with all my dates / friends / business contacts" (per mode), each place, or the whole list, can be shared with **chosen connections** (people you have a 1:1 chat with): "Choose people" on a place or under "Share my whole wishlist" (`SharePeopleSheet`). Stored in `wishlist_item_viewers`; written only via `set_wishlist_viewers()`, which silently drops anyone who isn't a connection. A **Shared with me** tab lists everything others shared with you (`get_wishlist_shared_with_me()`); tap one to plan a visit. Personally shared places are also used by Winkly AI when you plan with that person. Blocking hides everything. Tests: `supabase/tests/wishlist_sharing_test.sql`.

## 8. Not built yet

- Native **Share to Winkly** extension (iOS share sheet / Android intent). Needs a native build; the create screen already accepts the shared URL.
- **Business dashboard**: publish/promote events, sell tickets, analytics.
- Business accounts & dashboard: on hold until after the launch for private users.
- Moving calendar events when a plan's time changes.
