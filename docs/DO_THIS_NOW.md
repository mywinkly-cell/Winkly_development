# Do this now — get the concierge and weather tracking working in dev

**For:** Kate · **Time needed:** about 45 minutes · **Terminal required:** almost none

You are working **only in the dev project** (`gwgjdpqskusuejlwrsnd`). Production is not touched by anything in this guide. Ignore production entirely until dev works end to end.

Everything below is done in the Supabase website, except one optional step.

---

## Before you start — open these two tabs

1. **SQL Editor** → https://supabase.com/dashboard/project/gwgjdpqskusuejlwrsnd/sql
2. **Edge Function secrets** → https://supabase.com/dashboard/project/gwgjdpqskusuejlwrsnd/settings/functions

Keep both open; you'll go back and forth.

---

## Step 0 · Repair the missing columns (do this first)

Dev's `users` table is missing `premium_until`, even though your base schema migration defines it (`20250130000001_winkly_schema.sql:30`). The database has drifted from the migrations.

This matters more than it sounds. The gateway reads three columns at once:

```
.select("subscription_tier, premium_until, trial_ends_at")   -- ai-gateway/index.ts:395
```

If any one is missing the whole query errors, the code ignores the error, and the tier falls back to `"free"`. **So on dev every user is permanently Free regardless of what you set — the 3-day trial has never worked there either.** Step 1 alone would appear to succeed and change nothing.

**First, see how far the drift goes:**

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'users'
order by column_name;
```

**Then patch the columns** (safe to re-run):

```sql
alter table public.users
  add column if not exists premium_until    timestamptz,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at    timestamptz;
```

**Then check production too** — same `information_schema` query in the production SQL editor. If production is missing the same column, deploying the Edge Functions there will not fix anything, because every user will read as Free.

> Don't run `supabase db push` against dev until the column list above has been reviewed. If the base schema didn't fully apply, push may hit conflicts.

---

## Step 1 · Make your account Premium (5 minutes)

Right now your test account is Free, and the concierge is a Premium feature. That is the only reason it fails in Expo.

**Go to the SQL Editor tab.** Paste this in, replacing the email with the one you sign into the app with, then press **Run**:

```sql
update users
set subscription_tier = 'premium',
    premium_until     = now() + interval '1 year',
    trial_ends_at     = now() - interval '1 day'
where email = 'your-real-test-email@example.com';
```

Then check it worked:

```sql
select email, subscription_tier, premium_until, trial_ends_at
from users
where email = 'your-real-test-email@example.com';
```

You should see `premium` and a date one year from now.

> **Why `trial_ends_at` is set to yesterday:** every new signup automatically gets 3 days of Premium trial. Setting it to the past means you're testing *real* Premium, not the trial. Otherwise you can't tell which one you're seeing.

> **⏱ Important:** the server remembers your tier for **5 minutes**. After running this, wait 5 minutes before testing, or you'll still see "upgrade to Premium" and think it didn't work.

---

## Step 2 · Turn on weather tracking (15 minutes)

Weather tracking has never run — not once, in any environment. It needs a password that doesn't exist yet. You'll create it in two places, and **both must match exactly**.

### 2a. Create the password

Open **PowerShell** (press Windows key, type "PowerShell", Enter) and paste:

```powershell
[guid]::NewGuid().ToString() + [guid]::NewGuid().ToString()
```

It prints a long random string. **Copy it.** Paste it into Notepad for a moment — you need it twice and they must be identical.

### 2b. Add it as a secret

**Go to the Edge Function secrets tab** (the same page where you saw `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` etc).

- Click **Add another** / the new-secret fields
- **Name:** `CRON_SECRET`
- **Value:** paste your long string
- Click **Save**

It should now appear in the "Custom secrets" list alongside the others.

### 2c. Tell the database the same password

**Go back to the SQL Editor tab.** Paste this, replacing `PASTE_YOUR_LONG_STRING_HERE` with the *same* string:

```sql
insert into private.webhook_config (id, function_base_url, cron_secret)
values (true, 'https://gwgjdpqskusuejlwrsnd.supabase.co', 'PASTE_YOUR_LONG_STRING_HERE')
on conflict (id) do update
  set function_base_url = excluded.function_base_url,
      cron_secret       = excluded.cron_secret;
```

Press **Run**.

> **Why twice?** The database calls the weather function every hour and has to prove it's allowed to. The secret is the proof. If only one side has it, the function correctly refuses — which is exactly what has been happening.

### 2d. Check the scheduled jobs exist

```sql
select jobname, schedule, active from cron.job;
```

You should see `weather-pivot-cron` and `weekly-spark-cron`, both `active = true`.

---

## Step 3 · Test the concierge (10 minutes)

1. Stop Expo if it's running, then start it fresh: `npx expo start -c` (the `-c` clears the cache)
2. Sign in with the account you made Premium
3. Open the concierge and generate a plan

**It should now work.** If it doesn't, look at the terminal where Expo is running — the app prints a detailed line starting with `[ai-gateway]`. Copy that line and send it to me; it says exactly what went wrong.

Then test the other AI features too, because they take different paths and one working doesn't mean all do:

- [ ] Concierge plan generation
- [ ] Planner theme plans
- [ ] Chat topics
- [ ] Match agent
- [ ] Super-like icebreaker

---

## Step 4 · Actually see a weather pivot (this one takes patience)

This is the feature you care most about, and it has a specific trigger condition you need to know or you'll think it's broken.

**The weather function only looks at plans starting between 23 and 27 hours from now.** Not sooner, not later. It runs once an hour and skips everything outside that window.

It also only looks at plans with status `confirmed`. A plan you generated but never confirmed is invisible to it.

### To test it deliberately

1. In the app, create a plan and **confirm** it — for an **outdoor** activity, in a city where rain is forecast
2. Set the plan's start time for **tomorrow, roughly 24 hours from now**
3. Wait for the next hourly run, then check:

```sql
select id, status, pivot_of, created_at
from pending_plans
order by created_at desc
limit 10;
```

If the weather was bad enough, a new row appears with `status = 'pivot_pending'` and `pivot_of` pointing at your original plan. That's the app proposing an indoor alternative — the Bavaria rain scenario, automated.

To confirm the job is at least running (even if no plan qualified):

```sql
select start_time, status, return_message
from cron.job_run_details
order by start_time desc
limit 10;
```

You want to see recent rows. If `return_message` mentions 401 or Unauthorized, the two secrets in Step 2 don't match — redo 2b and 2c carefully.

---

## Step 5 · Optional — accounts for the other tiers (15 minutes)

Only do this when Steps 1–4 work. It lets you see what Free and Super users actually experience.

**The easy way, no terminal:**

1. In the app, sign up three more accounts. Dev has email confirmation switched off, so this is quick. Suggested: `kate+free@…`, `kate+super@…`, `kate+trial@…`
2. Then run this once in the SQL Editor, replacing the emails:

```sql
-- Free: trial expired, no paid tier
update users set subscription_tier = 'free',  premium_until = null,
       trial_ends_at = now() - interval '7 days'
where email = 'kate+free@example.com';

-- Super: paid, mid tier
update users set subscription_tier = 'super', premium_until = now() + interval '1 year',
       trial_ends_at = now() - interval '7 days'
where email = 'kate+super@example.com';

-- Trial: the 3-day new-user Premium, expiring in ~1 day
update users set subscription_tier = 'free',  premium_until = null,
       trial_started_at = now() - interval '2 days',
       trial_ends_at    = now() + interval '1 day'
where email = 'kate+trial@example.com';
```

What each should be able to do:

| Account | Can do | Cannot do |
|---|---|---|
| Free | 3 plans/day, confirm plans, get weather pivots, Weekly Sparks | Concierge, chat topics, match agent |
| Super | All of the above, unrationed, plus chat topics, event suggestions, match agent | Concierge, match bridge |
| Premium | Everything | — |
| Trial | Everything (for now) | — drops to Free in ~24h |

**The alternative** (if you're comfortable with a terminal) is the script I wrote, which does all of this in one command — see `supabase/scripts/seed-tier-test-users.mjs`.

---

## Do NOT do these yet

Deliberately out of scope today. They come after dev works:

- ❌ Anything on the production project
- ❌ Moving the Upstash database
- ❌ Building an APK
- ❌ Billing, domain, company, trademark

---

## If something goes wrong

| What you see | What it means |
|---|---|
| "Upgrade to Premium" | Step 0 columns still missing, or Step 1 didn't apply, or you haven't waited 5 minutes for the tier cache |
| `column "…" of relation "users" does not exist` | Schema drift — see Step 0 |
| "Request failed: 404" | You're pointed at production, not dev. Check `apps/mobile/.env` says `gwgjdpqskusuejlwrsnd` |
| "Check connection and try again" | Network, or Expo can't reach Supabase |
| Nothing in `cron.job_run_details` | The scheduled jobs aren't installed — the migration may not have been applied to dev |
| 401 in `return_message` | The two secrets in Step 2 don't match |

For anything else: the Expo terminal line starting `[ai-gateway]` and the Edge Function logs (Dashboard → Edge Functions → ai-gateway → Logs) together will say what happened.
