// Unit tests for the shared-plan page (mywinkly.de/p/<token>). Run: npm test (in website/).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMeta,
  escapeHtml,
  formatWhen,
  httpStatusFor,
  renderPlanPage,
  scriptJson,
  shareUrls,
  TOKEN_RE,
} from "../src/planShare/render.mjs";
import { pickLang, tr, PLAN_PAGE_STRINGS } from "../src/planShare/strings.mjs";
import { buildOgTree } from "../src/planShare/og.mjs";
import { fetchSharedPlan } from "../src/planShare/server.mjs";

const TOKEN = "abcdefghijklmnopqrstuvwx";
const ORIGIN = "https://mywinkly.de";

const okResult = (overrides = {}) => ({
  status: "ok",
  plan: {
    title: "Sunset picnic",
    starts_at: "2026-10-11T17:00:00Z",
    time_zone: "Europe/Berlin",
    ends_at: null,
    source_mode: "friends",
    neighbourhood: "Schwabing, München",
    fit_line: "You both love slow evenings outdoors.",
    host: { first_name: "Anna", photo_url: "https://cdn.example.com/a.jpg" },
    ...overrides,
  },
});

const render = (result, lang = "en") =>
  renderPlanPage({
    token: TOKEN,
    result,
    lang,
    origin: ORIGIN,
    supabaseUrl: "https://proj.supabase.co",
    anonKey: "public-anon-key",
    stores: { android: "https://play.google.com/store/apps/details?id=com.winkly.app" },
  });

function textOf(tree) {
  if (tree == null) return "";
  if (typeof tree === "string") return tree;
  if (Array.isArray(tree)) return tree.map(textOf).join(" ");
  return textOf(tree.props?.children);
}

test("tokens: only URL-safe 20–64 char tokens are accepted", () => {
  assert.ok(TOKEN_RE.test(TOKEN));
  assert.ok(TOKEN_RE.test("Ab-_".repeat(6)));
  assert.ok(!TOKEN_RE.test("short"));
  assert.ok(!TOKEN_RE.test(`${TOKEN}/../x`));
  assert.ok(!TOKEN_RE.test(`${TOKEN}<script>`));
});

test("share URLs: page, open-in-app (Universal Link prefix) and OG image", () => {
  assert.deepEqual(shareUrls(`${ORIGIN}/`, TOKEN), {
    page: `${ORIGIN}/p/${TOKEN}`,
    openInApp: `${ORIGIN}/app/p/${TOKEN}`,
    openInAppScheme: `winkly://app/p/${TOKEN}`,
    ogImage: `${ORIGIN}/p/${TOKEN}/og.png`,
  });
});

test("escaping: HTML and <script> JSON can't be broken out of", () => {
  assert.equal(escapeHtml(`<img src=x onerror="a">'&`), "&lt;img src=x onerror=&quot;a&quot;&gt;&#39;&amp;");
  const json = scriptJson({ s: "</script><script>alert(1)</script> " });
  assert.ok(!json.includes("</script>"));
  assert.ok(!json.includes(" "));
  assert.deepEqual(JSON.parse(json), { s: "</script><script>alert(1)</script> " });
});

test("rendered page escapes plan text from the RPC", () => {
  const html = render(okResult({ title: `<script>alert("x")</script>`, host: { first_name: `"><b>`, photo_url: null } }));
  assert.ok(!html.includes(`<script>alert("x")</script>`));
  assert.ok(html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"));
  assert.ok(!html.includes(`"><b>`));
});

test("ok page: plan card, I'm in, open-in-app, get-app, privacy notice + /privacy link", () => {
  const html = render(okResult());
  assert.match(html, /Sunset picnic/);
  assert.match(html, /Anna planned something for you/);
  assert.match(html, /Schwabing, München/);
  assert.match(html, /I&#39;m in 🙌/);
  assert.match(html, new RegExp(`href="${ORIGIN}/app/p/${TOKEN}" data-scheme="winkly://app/p/${TOKEN}"`));
  assert.match(html, /js-get-app/);
  assert.match(html, /We only use your name and email/);
  assert.match(html, /<a href="\/privacy">Privacy policy<\/a>/);
  assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
  // The browser posts straight to the rate-limited RPC with the public key only.
  assert.match(html, /"rpcUrl":"https:\/\/proj\.supabase\.co\/rest\/v1\/rpc\/web_rsvp"/);
});

test("Open Graph: title, description with local time, absolute 1200×630 image", () => {
  const html = render(okResult());
  assert.match(html, /<meta property="og:title" content="Sunset picnic — Anna planned something for you" \/>/);
  assert.match(html, /<meta property="og:description" content="Sun, Oct 11 · 7:00 PM · You in\?/);
  assert.match(html, new RegExp(`<meta property="og:image" content="${ORIGIN}/p/${TOKEN}/og.png\\?l=en" />`));
  assert.match(html, /<meta property="og:image:width" content="1200" \/>/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.match(html, new RegExp(`<meta property="og:url" content="${ORIGIN}/p/${TOKEN}" />`));
});

test("dead links reveal nothing about the plan and get the right HTTP status", () => {
  for (const status of ["revoked", "expired", "unavailable", "not_found", "error"]) {
    const html = render({ status });
    assert.ok(!html.includes(`class="btn btn-primary js-im-in"`), `${status}: no RSVP button`);
    assert.ok(!html.includes("og:image\""), `${status}: no plan preview image`);
    assert.ok(!html.includes("Sunset"), `${status}: no plan data`);
  }
  assert.equal(httpStatusFor("ok"), 200);
  assert.equal(httpStatusFor("full"), 200);
  assert.equal(httpStatusFor("not_found"), 404);
  assert.equal(httpStatusFor("revoked"), 410);
  assert.equal(httpStatusFor("expired"), 410);
  assert.equal(httpStatusFor("error"), 502);
});

test("full plan shows its title but no RSVP form", () => {
  const html = render({ ...okResult(), status: "full" });
  assert.match(html, /This plan is full/);
  assert.ok(!html.includes(`class="rsvp-form js-rsvp-form"`));
});

test("non-https host photos are dropped", () => {
  const html = render(okResult({ host: { first_name: "Anna", photo_url: "javascript:alert(1)" } }));
  assert.ok(!html.includes("javascript:alert"));
});

test("when: plan's own time zone, visitor's language; date only without a zone", () => {
  assert.equal(formatWhen("2026-10-11T17:00:00Z", "Europe/Berlin", "en"), "Sun, Oct 11 · 7:00 PM");
  assert.equal(formatWhen("2026-10-11T17:00:00Z", "Europe/Berlin", "de"), "So., 11. Okt. · 19:00");
  assert.equal(formatWhen("2026-10-11T17:00:00Z", "America/New_York", "en"), "Sun, Oct 11 · 1:00 PM");
  assert.equal(formatWhen("2026-10-11T17:00:00Z", null, "en"), "Sun, Oct 11");
  assert.equal(formatWhen("2026-10-11T17:00:00Z", "Not/AZone", "en"), "Sun, Oct 11");
  assert.equal(formatWhen("nope", "Europe/Berlin", "en"), null);
});

test("language: Accept-Language picks a supported language, English fallback", () => {
  assert.equal(pickLang("de-DE,de;q=0.9,en;q=0.8"), "de");
  assert.equal(pickLang("fr-FR,de;q=0.5"), "de");
  assert.equal(pickLang("fr-FR"), "en");
  assert.equal(pickLang("en;q=0.2,de;q=0.9"), "de");
  assert.equal(pickLang(undefined), "en");
  assert.equal(render(okResult(), "de").includes("Ich bin dabei 🙌"), true);
});

test("strings: every language has every key, with the same placeholders", () => {
  const placeholders = (s) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join(",");
  for (const [lang, table] of Object.entries(PLAN_PAGE_STRINGS)) {
    for (const [key, en] of Object.entries(PLAN_PAGE_STRINGS.en)) {
      assert.ok(typeof table[key] === "string", `${lang}.${key} missing`);
      assert.equal(placeholders(table[key]), placeholders(en), `${lang}.${key} placeholders`);
    }
  }
  assert.equal(tr("en", "invitedBy", { host: "Anna" }), "Anna planned something for you");
});

test("buildMeta for a dead link has no image", () => {
  const meta = buildMeta({ result: { status: "revoked" }, lang: "en", urls: shareUrls(ORIGIN, TOKEN) });
  assert.equal(meta.image, null);
  assert.match(meta.title, /no longer active/);
});

test("OG image tree: host, title, when + area; dead links show only the brand", () => {
  const text = textOf(buildOgTree(okResult(), "en"));
  assert.match(text, /Anna planned something for you/);
  assert.match(text, /Sunset picnic/);
  assert.match(text, /Sun, Oct 11 · 7:00 PM · Schwabing, München/);
  const dead = textOf(buildOgTree({ status: "revoked" }, "en"));
  assert.ok(!dead.includes("Sunset"));
  assert.match(dead, /Winkly/);
});

test("fetchSharedPlan: rejects bad tokens without a request; never throws", async () => {
  let calls = 0;
  const fakeFetch = async () => {
    calls += 1;
    return { ok: true, json: async () => okResult() };
  };
  const config = { supabaseUrl: "https://proj.supabase.co", anonKey: "a.b.c" };
  assert.deepEqual(await fetchSharedPlan("bad", config, fakeFetch), { status: "not_found" });
  assert.equal(calls, 0);
  assert.equal((await fetchSharedPlan(TOKEN, config, fakeFetch)).status, "ok");
  assert.deepEqual(await fetchSharedPlan(TOKEN, config, async () => { throw new Error("down"); }), { status: "error" });
  assert.deepEqual(await fetchSharedPlan(TOKEN, config, async () => ({ ok: false })), { status: "error" });
  assert.deepEqual(await fetchSharedPlan(TOKEN, { supabaseUrl: null, anonKey: null }, fakeFetch), { status: "error" });
});

test("web analytics: only known events, no token or ids, off without a key", async () => {
  const { parseWebEvent, posthogPayload, captureWebEvent } = await import("../src/planShare/analytics.mjs");
  assert.equal(parseWebEvent("not json"), null);
  assert.equal(parseWebEvent(JSON.stringify({ event: "something_else" })), null);
  assert.deepEqual(parseWebEvent(JSON.stringify({ event: "web_rsvp_submitted", lang: "de", token: TOKEN })), {
    event: "web_rsvp_submitted",
    lang: "de",
  });
  const payload = posthogPayload({ event: "share_link_opened", lang: "en" }, "phc_key");
  assert.ok(!JSON.stringify(payload).includes(TOKEN));
  assert.equal(payload.properties.$process_person_profile, false);
  assert.match(payload.distinct_id, /^web_[0-9a-f-]{36}$/);
  let called = false;
  assert.equal(await captureWebEvent({ event: "share_link_opened", lang: "en" }, {}, async () => { called = true; }), false);
  assert.equal(called, false);
});
