// POST /api/plan-event — beacon from the shared-plan page (share_link_opened, web_rsvp_submitted).
// Anonymous and cookieless; see src/planShare/analytics.mjs.

import { captureWebEvent, parseWebEvent } from "../src/planShare/analytics.mjs";

export async function POST(request) {
  const body = await request.text().catch(() => "");
  if (body.length <= 512) {
    await captureWebEvent(parseWebEvent(body));
  }
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
