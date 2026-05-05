# Supabase Integration Guide: Google Calendar & Maps

This guide describes what to configure in Supabase (and related services) to enable full integration of Google Calendar and Maps with the Winkly Planner.

---

## 1. Current State (Device-Level)

The app already supports:

- **Device calendar** – `expo-calendar` reads/writes the device’s native calendar (Apple Calendar on iOS, Google Calendar on Android if the user has it synced).
- **Device location** – `expo-location` requests foreground location for event locations and discovery.
- **Maps URLs** – Use `Linking.openURL()` with `https://maps.google.com/...` or `maps://` (iOS) to open directions.

No Supabase changes are required for these.

---

## 2. Google Calendar Cloud Sync (Supabase + Backend)

To sync planner items with the user’s **Google Calendar** account (not just the device calendar), you need:

### 2.1 Google Cloud Console

1. Create a project or use the existing one.
2. Enable **Google Calendar API**.
3. Create OAuth 2.0 credentials:
   - **Web application** – for Supabase Edge Function redirect.
   - **iOS** (bundle ID `com.winkly.app`) – for in-app OAuth.
   - **Android** (package `com.winkly.app`, SHA-1 of signing key) – for in-app OAuth.
4. Add authorized redirect URIs:
   - Supabase: `https://<project-ref>.supabase.co/auth/v1/callback` (if using Supabase Auth for Google).
   - Or your Edge Function URL for OAuth callbacks.

### 2.2 Supabase: `calendar_connections` Table

You already have `calendar_connections`:

```sql
-- calendar_connections (already in schema)
user_id UUID REFERENCES auth.users(id),
provider TEXT NOT NULL,           -- e.g. 'google'
external_id TEXT,                 -- Google user/calendar ID
token_encrypted TEXT,             -- OAuth access + refresh token (encrypt!)
last_sync_at TIMESTAMPTZ,
UNIQUE (user_id, provider)
```

**Use this table to:**

- Store OAuth access and refresh tokens (encrypted) per user.
- Store `external_id` (e.g. Google calendar ID).
- Track `last_sync_at` for incremental sync.

**RLS:** Ensure users can only SELECT/INSERT/UPDATE/DELETE their own rows (`auth.uid() = user_id`).

### 2.3 Supabase Edge Function: OAuth + Sync

Create an Edge Function that:

1. **OAuth flow**

   - Initiates Google OAuth (authorization URL).
   - Handles the callback, exchanges code for tokens.
   - Stores tokens in `calendar_connections` (encrypted) for the authenticated user.

2. **Sync logic**
   - Reads `planner_items` for the user.
   - Creates/updates events in Google Calendar via the Calendar API.
   - Updates `last_sync_at`.
   - Optionally: reads Google Calendar events and syncs them into `planner_items` (two-way).

**Secrets:** Store `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` in Supabase Edge Function secrets. Never expose them in the app.

### 2.4 App Flow

1. User taps “Allow calendar access” in Planner settings.
2. App opens the Edge Function OAuth URL (e.g. in a web view or browser).
3. User signs in with Google and grants calendar scope.
4. Callback redirects back to the app; Edge Function stores tokens.
5. App or Edge Function triggers a sync when planner items change.

---

## 3. Maps / Location Integration

### 3.1 Storing Location Data

Ensure planner items and events have location fields:

```sql
-- If not already present, add to planner_items:
ALTER TABLE public.planner_items
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;

-- events table already has:
-- location TEXT
-- Add lat/lng if needed:
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS location_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_lng DOUBLE PRECISION;
```

### 3.2 Geocoding (Address → Lat/Lng)

To convert addresses to coordinates:

- **Option A:** Use a Geocoding API (e.g. Google Maps Geocoding) in an Edge Function.
- **Option B:** Use a free service (e.g. OpenStreetMap Nominatim) in an Edge Function.

Store `location_lat`, `location_lng` when creating/updating items.

### 3.3 Opening Maps / Directions

In the app, open the native maps app:

```typescript
import { Linking } from "react-native";

// Google Maps URL (works on both iOS and Android)
const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
await Linking.openURL(url);

// Or Apple Maps on iOS
const appleMapsUrl = `https://maps.apple.com/?daddr=${lat},${lng}`;
```

No Supabase setup is required for opening maps; you only need to store and pass `location`, `location_lat`, `location_lng`.

---

## 4. Checklist

| Task                                                                  | Where                 | Status         |
| --------------------------------------------------------------------- | --------------------- | -------------- |
| Device calendar permission                                            | App (`expo-calendar`) | Done           |
| Device location permission                                            | App (`expo-location`) | Done           |
| Planner settings UI                                                   | App                   | Done           |
| `calendar_connections` table                                          | Supabase              | Exists         |
| RLS for `calendar_connections`                                        | Supabase              | Add if missing |
| Google OAuth credentials                                              | Google Cloud          | To configure   |
| Edge Function: OAuth + sync                                           | Supabase              | To implement   |
| `location` / `location_lat` / `location_lng` on planner_items, events | Supabase              | Add if missing |
| Geocoding (optional)                                                  | Edge Function         | To implement   |

---

## 5. Security Notes

- Encrypt OAuth tokens before storing in `token_encrypted`.
- Use Supabase Vault or a separate secrets store for API keys.
- Never put Google Client Secret or API keys in the mobile app.
- Enforce RLS so users can only access their own `calendar_connections` rows.
