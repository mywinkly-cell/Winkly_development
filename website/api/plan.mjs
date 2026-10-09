// GET /p/<token> (and /app/p/<token> without the app installed) → server-rendered "I'm in" page.
// Server-rendered so WhatsApp / Telegram / iMessage crawlers see real Open Graph tags.
// Rewrites live in website/vercel.json. See docs/PLAN_SHARING.md.

import { pickLang } from "../src/planShare/strings.mjs";
import { httpStatusFor, renderPlanPage } from "../src/planShare/render.mjs";
import { fetchSharedPlan, readConfig, siteOrigin } from "../src/planShare/server.mjs";
import { PLAN_PAGE_STYLES } from "../src/planShare/styles.mjs";

export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const config = readConfig();
  const lang = pickLang(request.headers.get("accept-language"));
  const result = await fetchSharedPlan(token, config);

  const html = renderPlanPage({
    token,
    result,
    lang,
    origin: siteOrigin(request, config),
    supabaseUrl: config.supabaseUrl,
    anonKey: config.anonKey,
    stores: config.stores,
    styles: PLAN_PAGE_STYLES,
  });

  const status = httpStatusFor(result.status);
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Short edge cache: a revoked link must stop working within a minute.
      "Cache-Control": status === 502 ? "no-store" : "public, max-age=0, s-maxage=60, stale-while-revalidate=60",
      Vary: "Accept-Language",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
