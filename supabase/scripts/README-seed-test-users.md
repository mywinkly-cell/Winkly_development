# Seed test users and chats (Kateryna)

## Demo inbox (recommended)

**`seed-kateryna-demo-chats.sql`** seeds **5 fake users** and **6 conversations** matching the Chats UI reference for `kateryna.my.wellness@gmail.com`:

| Chat | Mode | Notes |
|------|------|--------|
| Sofia Müller | Romance | Pending **Invite**, 2 unread |
| Marco Rossi | Friends | 1 unread |
| Group: Munich Hikers | Friends | Group thread |
| Petra Müller | Business | Read |
| Lisa Weber | Romance | Match, 3 unread |
| Event: Jazz Night | Events | Event chat |

Run in [Supabase SQL Editor](https://supabase.com/dashboard/project/gwgjdpqskusuejlwrsnd/sql) (paste file contents) or via MCP `execute_sql`. Safe to re-run.

Demo accounts use emails `*.demo@winkly-test.local` (password `TestPassword123!` — not needed for testing as you).

---

## Legacy script (3 generic test users)

Creates **3 fake users** and **matches/connections** with `kateryna.my.wellness@gmail.com` so you can test 1:1 and group chats in Romance, Friends, and Business modes.

## Prerequisites

1. **Your account exists**  
   Sign in at least once in the app with `kateryna.my.wellness@gmail.com` so the user exists in Supabase Auth.

2. **Service role key**  
   In [Supabase Dashboard](https://supabase.com/dashboard) → Project → **Settings** → **API**: copy **Project URL** and **service_role** (secret) key.

## Run the script

From the **repo root**:

```bash
# Set env vars (use your project URL and service_role key)
export SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

node supabase/scripts/seed-test-users-and-matches.mjs
```

Or use a `.env` file in the repo root with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, then:

```bash
export $(grep -v '^#' .env | xargs)
node supabase/scripts/seed-test-users-and-matches.mjs
```

## What it does

- Looks up the user with email `kateryna.my.wellness@gmail.com`.
- Creates 3 test users (if they don’t already exist):
  - `test1@winkly-test.local` — Alex River, Munich  
  - `test2@winkly-test.local` — Sam Taylor, Berlin  
  - `test3@winkly-test.local` — Jordan Lee, Hamburg  
- Inserts **user_profiles** and **profiles_mode** (romance, friends, business) for each test user.
- **Romance**: mutual likes with you → 3 romance DMs (via trigger).
- **Friends**: mutual follows with you → 3 friends DMs (via trigger).
- **Business**: mutual follows + 3 business DMs created via RPC.

After running, open Chats and switch between **Romance**, **Friends**, and **Business** to see the matches/connections and 1:1 chats. You can also start **group chats** from the Friends or Business tabs (Start group chat).

## Safe to re-run

If the script is run again, it skips creating users that already exist and ignores duplicate inserts for likes/follows, so it’s safe to run multiple times.
