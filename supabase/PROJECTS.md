# Supabase project refs (Winkly)

| Environment | Dashboard | Project ref | Region |
| ----------- | --------- | ----------- | ------ |
| **Production** (main / WinklyApp) | [WinklyApp](https://supabase.com/dashboard/project/gwgjdpqskusuejlwrsnd) | `gwgjdpqskusuejlwrsnd` | eu-central-1 |
| **Staging** (winkly-staging) | [winkly-staging](https://supabase.com/dashboard/project/orjccytcmklzcfjgqwwj) | `orjccytcmklzcfjgqwwj` | eu-west-1 |
| **Development** | Local `supabase start` | n/a | n/a |

## CLI helpers (from repo root)

```bash
npm run supabase:link:staging
npm run supabase:link:production
npm run supabase:push:staging      # migrations → staging
npm run supabase:push:production   # migrations → production (after staging QA)
```

## Edge Function secrets (staging)

After deploying functions to staging, copy required secrets from production (Dashboard → Edge Functions → Secrets), or set via CLI:

```bash
npx supabase secrets set --project-ref orjccytcmklzcfjgqwwj GEMINI_API_KEY=... OPENAI_API_KEY=...
```

Minimum for auth email links: **auth-redirect** (no extra secrets). **ai-gateway** needs LLM keys; **notify-fanout** needs `private.webhook_config` + push setup when testing notifications.
