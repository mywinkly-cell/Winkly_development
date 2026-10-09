// GET /p/<token>/og.png → 1200×630 link-preview image (rewrite in website/vercel.json).
// Uses the same privacy-safe get_shared_plan view as the page. Dead/unknown links get a generic
// Winkly card so nothing about the plan is revealed.

import { ImageResponse } from "@vercel/og";
import { buildOgTree, OG_SIZE } from "../src/planShare/og.mjs";
import { pickLang, SUPPORTED_LANGS } from "../src/planShare/strings.mjs";
import { fetchSharedPlan, readConfig } from "../src/planShare/server.mjs";

export async function GET(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const requested = url.searchParams.get("l");
  const lang = requested && SUPPORTED_LANGS.includes(requested) ? requested : pickLang(request.headers.get("accept-language"));
  const result = await fetchSharedPlan(token, readConfig());
  const cacheable = result.status !== "error";

  const render = (res) =>
    new ImageResponse(buildOgTree(res, lang), {
      ...OG_SIZE,
      headers: {
        "Cache-Control": cacheable ? "public, max-age=300, s-maxage=300" : "no-store",
        "X-Robots-Tag": "noindex",
      },
    });

  try {
    const image = render(result);
    // Force rendering now so a broken host photo URL falls back instead of failing the response.
    const body = await image.arrayBuffer();
    return new Response(body, { status: 200, headers: image.headers });
  } catch {
    const plan = result.plan ? { ...result.plan, host: { ...result.plan.host, photo_url: null } } : undefined;
    return render({ ...result, plan });
  }
}
