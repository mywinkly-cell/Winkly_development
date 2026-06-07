# Winkly legal website (winkly.app)

Static site generated from `docs/*.md` for Play Store, GDPR, and TMG (Impressum) compliance.

**No domain yet?** The site is **build-ready** without hosting. Run `npm run verify` here (or `npm run website:verify` from the repo root) to confirm the generated `dist/` pages are correct. Deploy to **winkly.app** (or your chosen domain) when you have a host — see [Deploy](#deploy-vercel) below. Until then, in-app links to `https://winkly.app/...` will not resolve; legal text still lives in `docs/` and the built HTML in `website/dist/`.

## Pages

| URL | Source |
|-----|--------|
| `/` | Landing with links |
| `/terms` | `docs/TERMS_OF_SERVICE.md` |
| `/privacy` | `docs/PRIVACY_POLICY.md` (includes `#cookies`) |
| `/community` | `docs/COMMUNITY_GUIDELINES.md` |
| `/imprint` | `docs/IMPRINT.md` |

In-app links are defined in `apps/mobile/app/account/legal.tsx` and `apps/mobile/app/(auth)/terms-cookies.tsx`.

## Before first deploy

1. **Update `legal-entity.json`** with your registered address, managing director, Handelsregister, and VAT ID. Placeholders will appear on live pages until you do.
2. **Replace winkly.app content** — the domain may currently serve an unrelated project. Deploy this site to the Winkly Vercel/hosting project connected to `winkly.app`.

## Build locally

```powershell
cd website
npm install
npm run build
```

Output: `website/dist/`. Preview with any static server, e.g. `npx serve dist`.

## Deploy (Vercel)

1. In Vercel, create or open the project for **winkly.app**.
2. Set **Root Directory** to `website`.
3. Framework preset: **Other** (build uses `vercel.json`).
4. Deploy. Ensure **Deployment Protection** is off for production so legal URLs are public.

Alternatively, from CLI:

```powershell
cd website
npx vercel --prod
```

## Verify (no domain required)

```powershell
# From repo root — builds dist/ and checks page content offline
npm run website:verify
```

After you connect a domain and deploy:

```powershell
npm run website:verify:live
```

Optional — against a local static server:

```powershell
cd website
npx serve dist -p 4173
npm run verify:local
```

## Maintenance

Edit markdown in `docs/` (single source of truth), then rebuild and redeploy. Bump **Last updated** dates in the legal docs when content changes.
