# Winkly — Environments (local / cloud dev / cloud production)

**Last updated:** 2026-06-06

### Repositories ↔ Supabase projects

| Repo | Supabase | Project ref | Role |
| ---- | -------- | ----------- | ---- |
| [**Winkly_development**](https://github.com/mywinkly-cell/Winkly_development) (public) | **Winkly_development** | `gwgjdpqskusuejlwrsnd` | Author migrations & Edge Functions; push here first |
| [**winkly-production**](https://github.com/mywinkly-cell/winkly-production) (private) | **winkly-production** | `orjccytcmklzcfjgqwwj` | Production snapshot + store builds; receive mirrored `supabase/` on promote |

See **docs/BRANCHING.md** for code promote (`Winkly_development/main` → `winkly-production/main`). See **supabase/PROJECTS.md** for migration rules.

| Environment | Backend | Mobile env file | EAS profile | Purpose |
| ----------- | ------- | --------------- | ----------- | ------- |
| **local** | `supabase start` | `.env.development` | `development` | Fast iteration; disposable data |
| **cloud dev** | Winkly_development `gwgjdpqskusuejlwrsnd` | `.env.cloud-development` (optional) | — | Shared team QA after local verify |
| **production** | winkly-production `orjccytcmklzcfjgqwwj` | `.env.production` | `preview` / `production` | Ship target; never experiment here |

---

## 1. One-time setup

```bash
cp apps/mobile/.env.development.example       apps/mobile/.env.development
cp apps/mobile/.env.cloud-development.example apps/mobile/.env.cloud-development   # optional
cp apps/mobile/.env.production.example        apps/mobile/.env.production
```

- **Local:** `supabase start` → copy API URL + anon key into `.env.development`.
- **Cloud dev:** [Winkly_development dashboard](https://supabase.com/dashboard/project/gwgjdpqskusuejlwrsnd) → Settings → API → `.env.cloud-development`.
- **Production:** [winkly-production dashboard](https://supabase.com/dashboard/project/orjccytcmklzcfjgqwwj) → `.env.production` or EAS secrets only.

---

## 2. Running the mobile app against a backend

```bash
npm run env:dev       # .env.development  → local stack
npm run env:prod      # .env.production   → production cloud (warns)
```

For **cloud dev**, copy manually: `cp apps/mobile/.env.cloud-development apps/mobile/.env` (or add a team script). Never point `.env.development` at production.

---

## 3. Migrations — one direction only

**Author in `Winkly_development` only.** Never create migrations in `winkly-production`.

```bash
# 1) Local verify
supabase db reset

# 2) Cloud development (Winkly_development)
npm run supabase:push:development:dry-run   # inspect first
npm run supabase:push:development

# 3) QA app against gwgjdpqskusuejlwrsnd if needed

# 4) Promote Winkly_development/main → winkly-production/main (mirrors supabase/)

# 5) Cloud production — dry-run before apply
npm run supabase:push:production:dry-run
npm run supabase:push:production
```

Edge Functions: deploy to **development** ref first, then **production** after QA.

---

## 4. EAS builds

| Profile | Repo | Supabase backend |
| ------- | ---- | ---------------- |
| `development` | `Winkly_development` | Local (dev client) |
| `preview` | `Winkly_development` | Production cloud (`orjccytcmklzcfjgqwwj`) for device QA |
| `production` | **`winkly-production` only** | `orjccytcmklzcfjgqwwj` |

---

## 5. Golden rules

- Migrations flow: **Winkly_development → local → `gwgjdpqskusuejlwrsnd` → promote → `orjccytcmklzcfjgqwwj`** — never skip dev cloud, never author in the private repo.
- Always `supabase:push:production:dry-run` before a prod push.
- Keep real `.env.*` off git (only `*.example` tracked).
- Separate PostHog/analytics keys per environment.
