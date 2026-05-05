# Winkly — Full Product Documentation

**Single source of truth** for technical and design decisions.  
Maintained as CTO/Product Owner reference. **Update this document whenever the app or backend changes.**

---

## Document metadata

| Field | Value |
|-------|--------|
| **Last updated** | 2026-02-13 (go-live + Play doc) |
| **Schema version** | v8.1 (Identity Firewall) |
| **Mobile app** | Expo SDK 54, React Native 0.81, expo-router 6 |
| **Backend** | Supabase (Auth, Postgres, Edge Functions, RLS) |

Changelog: Chat tabs — matches/connections subheader under tabs (Romance/Friends/Business); tap match → Start chat, Start group chat, or Cancel match. Unmatch/unfollow API. Removed “Chat with match”/“New chat” buttons from inbox.

---

## 1. Product overview

### 1.1 What is Winkly?

Winkly is a **multi-mode social and planning app** that combines:

- **Romance** — Dating: discover, match (mutual like), chat 1:1, plan dates.
- **Friends** — Platonic connections: match (mutual follow), 1:1 and **group chats**, invite contacts, plan meetups and events.
- **Business** — Professional discovery (LinkedIn + Instagram style): search/filter by role, company, industry; 1:1 and group chats; plan business meetings and events.
- **Events** — Create and discover events; participate; event chats; integrate with Planner.

All modes share a **unified Planner** (dates, meetups, business meetings, events) and an **AI concierge** that prioritizes Winkly events and business offers first, falling back to external suggestions only when needed.

### 1.2 Account types

| Type | Description | Modes available |
|------|-------------|------------------|
| **Personal** | One user, multiple sub-profiles (Romance, Friends, Business). | Romance, Friends, Business, Events (Events always) |
| **Business** | Company/brand account. | Business, Events |

- **Personal**: User creates **sub-profiles** per mode (Romance, Friends, Business). Each has its own bio, photos, interests, mode-specific fields.
- **Business**: Single **profiles_business** (business name, location, bio, logo, social links). No Romance/Friends sub-profiles.
- **Events** mode is available to all users regardless of account type.

### 1.3 Core product principles

1. **Identity Firewall** — Data and UI are strictly separated by mode. No cross-mode leakage (e.g. Romance data never shown in Business).
2. **AI prioritizes Winkly** — AI suggests Winkly events and business offers first; external sources only as fallback.
3. **Single app, multiple personas** — One account can switch between modes; each mode has its own discover, chats, and planner context.

---

## 2. Modes — Features and rules

### 2.1 Mode matrix

| Mode | Discover / Match | 1:1 Chats | Group Chats | Who can chat | Planner source |
|------|------------------|-----------|-------------|--------------|----------------|
| **Romance** | Like → mutual match | ✅ Matches only | ❌ No | Matches only | `romance` (dates) |
| **Friends** | Follow → mutual follow | ✅ Matches + invited contacts | ✅ Yes | Matches + contacts (incl. invites) | `friends` (meetups) |
| **Business** | Search/filter, connect | ✅ Connections + contacts | ✅ Yes | Connections + contacts | `business` (meetings) |
| **Events** | Browse events, join | ✅ Event participants | ✅ Yes | Event participants | `events` |

### 2.2 Sub-profile requirement for group chats

- Before joining a **group chat** in Friends or Business, the user must have the corresponding sub-profile (Friends or Business) enabled.
- If not: show prompt *"Create your [Friends/Business] profile to join this chat."*

### 2.3 Business mode positioning

- **LinkedIn + Instagram mix**: professional discovery + direct contact + planning.
- Features: search/filter by role, company, industry, location, interests; 1:1 chat; plan “business dates” (coffee, golf, lunch); discover and create events (Event mode); businesses can advertise offers/events on Winkly.

---

## 3. Technical architecture

### 3.1 Repository structure

```
WinklyApp_3/
├── apps/
│   └── mobile/          # Expo (React Native) app — main product
├── auth-redirect/       # Optional Vercel deploy for email verification redirect
├── docs/                # Product and integration docs (this file)
├── scripts/             # Build/deploy scripts
├── supabase/
│   ├── config.toml
│   ├── migrations/      # Postgres schema + RLS + triggers
│   ├── functions/       # Edge Functions (auth-redirect, ai-gateway)
│   └── scripts/         # Verification / seed scripts (see docs/SQL_ORGANIZATION.md)
├── package.json         # Root: Supabase CLI, deploy scripts
└── .vscode/
```

- **Single app**: `apps/mobile` is the only front-end app (Expo).
- **Backend**: Supabase (Auth, Postgres, Storage, Edge Functions). No separate Node server in repo.

### 3.2 Mobile app stack

| Layer | Technology |
|-------|------------|
| Runtime | React Native 0.81, Expo SDK 54 |
| Navigation | expo-router 6 (file-based) |
| State | React context (Auth, Mode), local state; AsyncStorage for persistence |
| Backend client | @supabase/supabase-js (anon key; RLS enforces security) |
| Fonts | @expo-google-fonts/poppins (400, 500, 600, 700) |
| UI | Custom components; design tokens in `constants/tokens.ts` |

### 3.3 Key dependencies (mobile)

- **Auth/session**: `@supabase/supabase-js`, `@react-native-async-storage/async-storage` (auth persistence), `expo-secure-store`, `expo-auth-session`, `expo-apple-authentication`, `expo-web-browser`
- **Navigation**: `expo-router`, `react-native-screens`, `react-native-safe-area-context`
- **Media**: `expo-image-picker`, `expo-image-manipulator`, `@neilromblon/expo-image-manipulator-view`
- **Calendar/Location**: `expo-calendar`, `expo-location`
- **UI**: `react-native-gesture-handler`, `react-native-reanimated`, `expo-blur`, `@react-native-community/datetimepicker`
- **Polyfills**: `react-native-url-polyfill` (required for Supabase on RN)
- **Analytics**: `posthog-react-native` (product analytics, session tracking, optional)

### 3.4 Environment variables (mobile)

- `EXPO_PUBLIC_SUPABASE_URL` — Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon (public) key
- `EXPO_PUBLIC_AUTH_REDIRECT_URL` — Optional; email verification redirect (e.g. Supabase Edge Function or Vercel). Default: `winkly://callback`
- `EXPO_PUBLIC_POSTHOG_API_KEY` — Optional; PostHog project API key. When unset, analytics are disabled.
- `EXPO_PUBLIC_POSTHOG_HOST` — Optional; PostHog host. Default: `https://us.i.posthog.com` (use `https://eu.i.posthog.com` for EU)

### 3.5 Analytics (PostHog)

- **Provider**: `PostHogProvider` in `app/_layout.tsx`; only initialized when `EXPO_PUBLIC_POSTHOG_API_KEY` is set.
- **Identity**: `PostHogIdentitySync` identifies the user by Supabase `user.id` on login and calls `posthog.reset()` on logout. No PII (e.g. email) in identify.
- **Screen tracking**: `PostHogScreenTracker` sends `posthog.screen(pathname)` on route change (expo-router pathname).
- **App lifecycle**: `captureAppLifecycleEvents: true` sends Application Opened, Became Active, Backgrounded for session behavior.
- **Custom events**: Use `usePostHog()` and `posthog.capture('event_name', { ... })` where needed. Do not send PII or message content.

---

## 4. Data model (Supabase)

### 4.1 Enums (Postgres)

- `account_type`: `personal`, `business`
- `app_mode`: `romance`, `friends`, `business`, `events`
- `planner_source`: `romance`, `friends`, `business`, `events`
- `conversation_type`: `dm`, `group`, `event`, `ai`, `system`
- `visibility`: `public`, `connections`, `private`
- `dm_source`: `match`, `connection`, `invite`, `event`
- `message_type`: `text`, `image`, `video`, `audio`, `file`, `gif`, `sticker`, `system`, `poll`, `location`, `cta`
- `member_role`: `owner`, `admin`, `moderator`, `member`
- `delete_type`: `none`, `for_me`, `for_everyone`
- `report_reason`: `spam`, `harassment`, `inappropriate`, `fake`, `other`

### 4.2 Core tables

| Table | Purpose |
|-------|---------|
| **users** | Extends `auth.users`: `account_type`, `is_premium`, `premium_until`, `status`. Synced via trigger `on_auth_user_created`. |
| **profiles_core** | Personal core profile: name, gender, birthday, city, education, languages, occupation, bio, core_photos, instagram. |
| **profiles_mode** (or **sub_profiles**) | Personal sub-profiles per mode: `user_id`, `mode`, `bio`, `photos`, `interests`, `meta` (mode-specific JSON). Unique on `(user_id, mode)`. |
| **profiles_business** | Business account profile: business_name, location, area, bio, tags, website, instagram, facebook, linkedin, logo_uri. |
| **follows** | Follow relationship: `follower_id`, `followee_id`. Used for Friends/Business “connections”; mutual follow can create DM (trigger). |
| **events** | Events: created_by, title, description, location, starts_at, ends_at, cover_image_uri, visibility, mode. |
| **event_participants** | event_id, user_id, role, rsvp_status. |
| **event_invitations** | event_id, inviter_id, invitee_id, status. |
| **planner_items** | created_by, source_mode (romance/friends/business/events), title, description, starts_at, ends_at, related_event_id, related_user_id, meta. |
| **planner_participants** | planner_item_id, user_id, role. |
| **conversations** | type (dm/group/event/system/ai), mode, created_by, related_event_id, related_group_id, last_message_at, archived, name, is_system, dm_source, dm_initiator, etc. |
| **conversation_members** | conversation_id, user_id, role, joined_at, left_at, invited_by. |
| **conversation_member_settings** | conversation_id, user_id, pinned, muted, archived, last_read_at. |
| **messages** | conversation_id, sender_id, content, message_type, attachments (JSONB), reply_to_id, edited_at, deleted_at, delete_type, status. |
| **message_reactions** | message_id, user_id, emoji. |
| **message_read_receipts** | message_id, user_id, read_at. |
| **groups** | created_by, name, mode. |
| **group_members** | group_id, user_id, role. |
| **wishlist_items** | user_id, title, description, mode (DB). (App currently uses in-memory store in `lib/wishlistStore.ts` for MVP.) |
| **user_preferences** | user_id, key, value (JSONB). |
| **calendar_connections** | user_id, provider, external_id, token_encrypted, last_sync_at (for future Google Calendar OAuth sync). |
| **ai_requests** | user_id, mode, task — telemetry only; no raw content. |
| **user_blocks** | blocker_id, blocked_id (referenced in chat APIs). |

### 4.3 RLS (Row Level Security)

- **users**: SELECT/UPDATE own row only.
- **profiles_core**, **profiles_mode**, **profiles_business**: full access to own row(s).
- **follows**: SELECT if follower or followee; INSERT/DELETE as follower.
- **events**: SELECT if creator or participant; INSERT/UPDATE as creator. **event_participants**, **event_invitations**: participant or event creator.
- **planner_items**: SELECT if creator or in planner_participants; INSERT/UPDATE as creator. **planner_participants**: participant or item creator.
- **conversations**: SELECT if member; INSERT as created_by. **conversation_members**, **messages**: member or conversation creator as per policies.
- **groups**, **group_members**: creator or member.
- **wishlist_items**, **user_preferences**, **calendar_connections**, **ai_requests**: own rows only.

All tables in the schema have RLS enabled; no table is globally readable/writable by anon.

### 4.4 Triggers and RPCs

- **handle_new_user**: On INSERT/UPDATE of `auth.users`, upsert `public.users` with `id`, `email`, `account_type` from `raw_user_meta_data`.
- **create_direct_chat**: RPC to create or return existing DM between two users in a mode (p_user_a, p_user_b, p_mode, p_source, p_initiator).
- **create_event_chat**: RPC to create or return event-linked conversation for an event.
- **Direct chat on mutual follow**: Triggers (see chat migrations) create DM when mutual follow is established where applicable.

### 4.5 Views / compatibility

- **profiles_mode** may be backed by or aligned with **sub_profiles** (migration `align_sub_profiles`). App uses mode-scoped profile reads via `lib/access/profiles.ts` (`profiles_mode` for personal, `profiles_business` for business).

---

## 5. Authentication and session

### 5.1 Auth provider

- **AuthProvider** (`providers/AuthProvider.tsx`): Single source of truth for session.
- Uses `supabase.auth.getSession()` on load and `onAuthStateChange` for updates.
- Exposes: `session`, `user`, `loading`, `accountType` (from `user_metadata.account_type`), `signOut()`.
- Recoverable auth errors (e.g. invalid refresh token, session expired): clear session locally and optionally call `signOut({ scope: "local" })` so user is sent to splash.

### 5.2 Auth flow (high level)

1. **Splash** → if no session: **Welcome intro** or **Get started** / **Sign in**.
2. **Sign up**: email + password (or OAuth); `account_type` in metadata for new user.
3. **Email verification**: Supabase sends link. Link can point to **auth-redirect** (Edge Function or Vercel) that redirects to `winkly://callback` with hash/query so in-app browser can open the app.
4. **Callback** (`(auth)/callback.tsx`): Handles deep link, exchanges fragment for session.
5. **Post-auth**: RouteGuard + ModeContext load; if no mode selected or no permissions, user goes to **mode-selection** or onboarding.

### 5.3 Auth redirect (email verification)

- Problem: Gmail/in-app browsers may not open `winkly://` directly; user sees white page.
- Solution: Redirect URL in Supabase set to an HTTPS page that:
  - Shows “Opening Winkly…”
  - Redirects to `winkly://callback` with hash/query (tokens).
  - Fallback: “Tap here to try again” link with same deep link.
- Implementations:
  - **Supabase Edge Function** `auth-redirect`: Serves HTML with correct `Content-Type: text/html`. Deploy with `npm run supabase:deploy-auth-redirect`. Add function URL to Supabase Redirect URLs.
  - **Vercel**: Deploy `auth-redirect/`; add that URL to Redirect URLs; set `EXPO_PUBLIC_AUTH_REDIRECT_URL` in app.
- Config: `constants/config.ts` uses `EXPO_PUBLIC_AUTH_REDIRECT_URL` or default `winkly://callback`.

### 5.4 Session persistence

- Supabase client uses `AsyncStorage` for auth storage, `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false` (no URL-based session detection in RN).

---

## 6. Identity Firewall and mode context

### 6.1 ModeContextProvider

- **ModeContextProvider** (`providers/ModeContextProvider.tsx`): Single source of truth for **active mode** and **permissions**.
- Loads from `users` (account_type, is_premium) and `sub_profiles` / `profiles_mode` (which modes exist for this user). Builds `permissions: Mode[]` (always includes `events`; for personal adds romance/friends/business if sub-profile exists; for business adds business).
- Context shape: `user_id`, `account_type`, `active_mode`, `active_persona_id`, `permissions`, `subscription_tier`. In dev, `subscription_tier` is forced to `premium` for testing.

### 6.2 RouteGuard

- **RouteGuard** (`components/RouteGuard.tsx`): Runs after Auth + ModeContext load.
  - No session and not on auth route → replace to `/(auth)/splash`.
  - Session and on a mode route (romance/friends/business/events) and `context.active_mode` set but not in `context.permissions` → replace to `/(onboarding-personal)/mode-selection`.

### 6.3 Mode switching

- **setActiveMode(mode, personaId?)**: Updates context and **replaces** router to the corresponding mode root: `/(modes)/romance`, `/(modes)/friends`, `/(modes)/business`, `/(modes)/events`. This avoids stacking mode-specific screens from another mode (Identity Firewall).

### 6.4 Access layer (lib/access)

- All mode-sensitive data access goes through `lib/access/*`: `profiles`, `planner`, `events`, `conversations`, `connections`.
- **getProfilesForMode(mode, userId)**: Uses `profiles_mode` for romance/friends, `profiles_business` for business; no cross-mode reads.
- **getPlannerItems(userId, sourceMode?)**: Optional filter by `source_mode`.
- **getConversations(userId, mode?)**: Mode-filtered; RLS ensures only member conversations.
- **getEventsForUser**, **getEvent**: RLS enforces participant/creator access.

---

## 7. Navigation and routing (expo-router)

### 7.1 Route groups (high level)

- **(auth)** — Splash, welcome-intro, intro, get-started, signin, signup, verify, email-verified, callback, reset-password, reset-confirm, welcome-back-setup.
- **(onboarding-personal)** — get-started-personal, welcome-personal, profile-core, winkly-world, get-started (flow), mode-selection (index, planner, chats), etc.
- **(onboarding-business)** — welcome-business, get-started-business, profile-business.
- **(modes)** — romance, friends, business, events (each with index, discover, planner, chats, filters, profile-view, matches, liked, groups, companies, create-event, event-details, etc.).
- **(shared-ui)** — search, notifications, not-found.
- **planner** — Planner hub (index), filters, settings, dates, friends-meetups, business-meetings, events, invitations.
- **profile** — index, preview, view-profile, edit-core, edit-romance, edit-friends, edit-business, edit-media, verification.
- **account** — index, subscription, profile-settings, invite, notifications-preferences, account-identity, privacy-safety, blocked-users, legal, payments, premium, delete-deactivate, app-info.
- **chats** — index, new-chat, chat-view, [conversationId].
- **groups** — index, create-group, edit-group, group-details, member-list, group-chat.
- **wishlist** — index, create, edit, details.

### 7.2 Root layout

- **app/_layout.tsx**: SafeAreaProvider → AuthProvider → ModeContextProvider → ThemeProvider → RouteGuard → Stack. Fonts: Poppins (with 5s timeout so Expo Go doesn’t hang). Header: ScreenTopSpacer; contentStyle background from tokens; animation fade. Splash screen hides when fonts ready (or timeout).

### 7.3 Index redirect

- **app/index.tsx**: Redirects to `/(auth)/splash`.

---

## 8. Features by area

### 8.1 Onboarding and intro

- **Intro flags** (`lib/introFlags.ts`): AsyncStorage keys for `intro_seen`, `winkly_world_seen`, `winkly_world_dont_show`. Used to show “Winkly World” and first-time flows once; clear intro on session invalidation if desired.
- **Splash**: Animated wink; after delay, redirect to welcome-intro (first time) or signin/splash based on session and intro state.
- **Personal onboarding**: get-started-personal → welcome-personal → profile-core → (winkly-world) → mode-selection. Mode-selection allows choosing which modes to enable and leads to planner/chats onboarding steps.
- **Business onboarding**: welcome-business → get-started-business → profile-business.

### 8.2 Profile

- **Core**: profiles_core (first_name, last_name, gender, birthday, city, education, languages, occupation, bio, core_photos, instagram). **edit-core** and **edit-media** load from and persist to Supabase via `lib/access/profiles` (getOwnProfileCore, upsertOwnProfileCore). edit-media persists core_photos array; real upload uses expo-image-picker + Storage (future).
- **Mode-specific**: Romance (edit-romance), Friends (edit-friends), Business (edit-business). All load/save via getOwnProfileMode + upsertOwnProfileMode (profiles_mode). Romance stores relationship_goal, what_you_value, dealbreakers in meta; Friends stores interests (array) + meetup_style, availability in meta; Business for **personal** accounts stores role, company, networking_goal, skills in meta. **Business accounts** use profiles_business (getOwnProfileBusiness, upsertOwnProfileBusiness) for business_name, bio, tags.
- **Verification**: profile/verification (placeholder or future verification flow).
- **View profile**: profile/view-profile, profile/preview; mode-specific profile-view under (modes)/romance|friends|business. Can be wired to same access layer for read-only display.

### 8.3 Planner

- **Hub**: `app/planner/index.tsx`. Tabs: All, Dates, Meet-ups, Business, Events, Archive. Filter by time range (today, this week, etc.). Uses `getPlannerItems` from access layer; can filter by source_mode.
- **Planner item**: title, description, date/time, location, participants (EventParticipantCard), source (romance/friends/business/events). Actions: confirm, reschedule, cancel; archive.
- **Settings**: planner/settings (calendar sync, location, notifications). Device calendar via expo-calendar; device location via expo-location; future: Google Calendar OAuth via Edge Function and calendar_connections.
- **Sub-screens**: dates, friends-meetups, business-meetings, events, invitations (by tab/source).

### 8.4 Chats

- **Types**: DM, group, event, system, AI (ConversationType). Display: direct, group, event, system.
- **API** (`lib/chats/api.ts`): sendMessage, createDirectChat (RPC), createEventChat (RPC), blockUser, unmatchRomance, unfollowConnection, etc. Messages support text, attachments, reply_to_id, message_type.
- **Hooks** (`lib/chats/hooks.ts`): Conversations list and messages per conversation.
- **Screens**: chats index (inbox), new-chat, chat-view, [conversationId]. Mode-specific chat tabs under each mode (romance/chats, friends/chats, business/chats, events/chats). **Matches/connections subheader**: under the tab bar (Romance, All, Friends, Business, Events), when Romance/Friends/Business tab is active, a horizontal row shows that mode’s matches (Romance: mutual likes; Friends/Business: mutual follows) as profile avatars. Tapping an avatar opens options: Start chat (1:1), Start group chat (Friends/Business only; then name + optional description on create-group), Cancel match (with reasons; optional Block and remove). ChatsInboxContent renders tabs, subheader, then conversation list; no separate “Chat with match” / “New chat” buttons on the chat tab screen.
- **Rules**: Romance — 1:1 only, matches. Friends/Business — 1:1 + group; sub-profile required for group. Events — 1:1 + group for event participants.

### 8.5 Events

- **Model**: events + event_participants + event_invitations; optional event chat (create_event_chat).
- **Screens**: (modes)/events/discover, create-event, event-details; planner/events tab. Event participant cards (EventParticipantCard) show in planner and event details.

### 8.6 Groups

- **Model**: groups + group_members; conversation can have related_group_id.
- **Screens**: groups index, create-group, edit-group, group-details, member-list, group-chat. Mode-specific entries under friends/groups, business/groups.

### 8.7 Wishlist

- **Current**: In-memory store in `lib/wishlistStore.ts` (WishlistItem: id, title, description, url, price, createdAt, updatedAt). CRUD: listWishlistItems, getWishlistItem, createWishlistItem, updateWishlistItem, deleteWishlistItem.
- **DB**: Table `wishlist_items` exists (user_id, title, description, mode). Future: migrate app to use Supabase wishlist_items and deprecate in-memory store.

### 8.8 AI

- **Client heuristics** (no LLM in app): `lib/ai/romanceInsights.ts` (compatibility score, match tags, conversation starter, profile insight from Romance profile fields); `lib/ai/friendsInsights.ts` (Friends compatibility, match tags). Deterministic, no PII sent to external AI in these.
- **AI Gateway** (Supabase Edge Function `ai-gateway`): Authenticated; accepts mode, task (rank, suggest, summarize), context, candidates. Validates mode and task; logs to `ai_requests`; TODO: call LLM with allowlisted fields only; currently returns stub (ranked list). No provider keys exposed to client.

### 8.9 Subscription and premium

- **users.is_premium**, **users.premium_until**; context exposes `subscription_tier` (free/premium/enterprise). In __DEV__ forced to premium. Account screens: subscription, premium, payments; subscription tier gates features as needed.

---

## 9. Design system

### 9.1 Design tokens (`constants/tokens.ts`)

- **Colors**: Brand primaryViolet `#5A189A`, secondaryViolet `#7B2CBF`, accentYellow `#FFD60A`. Mode colors: romance (red), friends (orange), business (blue), events (violet). Surfaces: backgroundMuted `#F9F7FB`, card white, borders, text primary/secondary, feedback error/success.
- **Typography**: Poppins (400, 500, 600, 700). h1–h3, body, caption, button; headerWinklyTitle (22px bold for “Winkly” in header).
- **Layout**: 8pt grid (`gridUnit: 8`). Radii: card 20, control 12, avatar 24. Spacing xs–xxl. `screenPadding: 20`, `screenTopPadding: 12`, `topHeaderBar` (TOP_HEADER_BAR), `bottomBarHeight: 76`, `touchTargetMin: 44`.
- **FontFamily**: heading (Poppins_600SemiBold), headingBold (Poppins_700Bold), body (System).
- **Shadow**: card, button (elevation + shadow for iOS/Android).

### 9.2 Components (selected)

- **Layout**: ModeHeader, ModeBottomBar, ModeSwitchCenterButton, FriendsBottomNav, RomanceBottomNav, ModeSelectionBottomBar, PlannerHeader, SafeScreenView, ScreenTopSpacer.
- **UI**: Button, Card, InputField, Avatar, ProgressRing, EventParticipantCard.
- **Media**: ImageCropModal, PhotoConfirmModal.
- **Navigation**: ModeSwitch, ModeSwitchButton.
- **Chats**: ChatsInboxContent, ChatPreviewCard, MatchesPanel.
- **Onboarding**: BusinessSubProfile, FriendsSubProfile, RomancesSubProfile, InterestSelect.

### 9.3 Theming

- **ThemeProvider**: Wraps app for future theme (e.g. dark) or token overrides; currently layout and colors from tokens.

---

## 10. External integrations

### 10.1 Device calendar and location

- **expo-calendar**: Read/write device calendar (Apple Calendar / Android calendar). No Supabase change required.
- **expo-location**: Foreground location for event locations and discovery. No Supabase change required.

### 10.2 Google Calendar cloud sync (future)

- **calendar_connections** table: user_id, provider, external_id, token_encrypted, last_sync_at. RLS: own rows only.
- Flow: Planner settings “Allow calendar access” → OAuth via Edge Function → store tokens → sync planner_items to Google Calendar (and optionally reverse). Secrets (Google client id/secret) in Edge Function only. See `docs/SUPABASE_CALENDAR_MAPS_INTEGRATION.md`.

### 10.3 Maps / directions

- Store location, location_lat, location_lng on planner_items and events (migrations may add lat/lng if missing).
- Open directions: `Linking.openURL` with Google Maps or Apple Maps URL. No Supabase setup for opening maps.

### 10.4 Deep linking

- Scheme: `winkly://`. Callback path: `winkly://callback` for auth. Used after email verification and OAuth redirects.

---

## 11. Scripts and deployment

### 11.1 Root

- `npm run supabase:deploy-auth-redirect` — Deploy Supabase Edge Function `auth-redirect`.

### 11.2 Mobile

- `npm start` / `expo start`, `expo start -c` (clear), `expo run:android`, `expo run:ios`, `expo start --web`.
- Lint: `npm run lint` (ESLint). Test: `npm run test` (Jest).
- Android emulator: Supabase client uses custom fetch that rewrites localhost/127.0.0.1 to 10.0.2.2 in __DEV__.

### 11.3 Supabase

- Migrations: Apply with Supabase CLI (`supabase db push` or link + push). Order: schema → RLS → chat extras → triggers (direct chat, unread counts, etc.).
- Edge Functions: Deploy with Supabase CLI; set secrets (e.g. SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY for ai-gateway).

### 11.4 Go live and Google Play

- **Go live checklist** (backend, env, OAuth, legal, first production build): see **docs/GO_LIVE_AND_PLAY_STORE.md**.
- **EAS**: `apps/mobile/eas.json` defines build profiles (`production` → Android App Bundle) and optional submit profile for Play. Set production env vars in Expo dashboard or EAS secrets; run `eas build --platform android --profile production` to produce the AAB for Google Play.
- **Google Play**: Developer account ($25), store listing, content rating, data safety, then upload AAB and release (internal testing first recommended).

---

## 12. Security and compliance (summary)

- **No PII in AI telemetry**: `ai_requests` stores only user_id, mode, task.
- **RLS on all tables**: No table bypass; anon key used with strict RLS.
- **Mode isolation**: Access layer and RouteGuard prevent cross-mode data and navigation.
- **OAuth/secrets**: Only in Edge Functions or server-side; never in client.
- **Auth redirect**: HTTPS page for verification links to avoid in-app browser issues; deep link to app with tokens.

---

## 13. How to keep this document up to date

1. **Schema or RLS change** — Update **Section 4** (Data model), and **Section 10** if new integrations.
2. **New screen or route** — Update **Section 7** (Navigation) and **Section 8** (Features) as needed.
3. **New mode rule or product rule** — Update **Section 1** and **Section 2**.
4. **Design token or component change** — Update **Section 9**.
5. **Auth or session behavior** — Update **Section 5**.
6. **New env var or deploy step** — Update **Section 3** and **Section 11**.
7. **Bump “Last updated”** at the top and add a short changelog line below if useful.

---

## 14. Related docs

- **GO_LIVE_AND_PLAY_STORE.md** — Go-live checklist and Google Play (and optional iOS) publishing.
- **PRODUCT_VISION_AI_AND_MODES.md** — Product vision, AI prioritization, mode-specific chat rules, Friends/Business behavior.
- **SUPABASE_CALENDAR_MAPS_INTEGRATION.md** — Google Calendar and Maps setup with Supabase.
- **auth-redirect/README.md** — Auth redirect deployment (Vercel / Edge Function).

---

*This document is the single source of truth for Winkly product and technical design. When in doubt, align code and behavior with this doc and then update the doc to reflect the change.*
