// Server-rendered HTML for mywinkly.de/p/<token> — the "I'm in" page for a shared plan.
// Pure functions (no I/O) so they're unit-tested in website/test/planPage.test.mjs.
//
// The plan data comes from the get_shared_plan RPC, which only ever returns: title, start time,
// the host's time zone, neighbourhood (never an exact address), host first name + main photo and
// the AI "fit" line. Everything is HTML-escaped; the page config is JSON-escaped for <script>.

import { tr } from "./strings.mjs";

export const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON that is safe inside <script>…</script> (no "</script>", no U+2028/2029 surprises). */
export function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function safeHttpsUrl(url) {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * "Sat, 12 Oct · 19:00" in the visitor's language and the plan's own time zone.
 * Without a time zone (older links) only the date is shown server-side; the browser fills in
 * the time in the visitor's zone.
 */
export function formatWhen(startsAt, timeZone, lang) {
  const d = new Date(startsAt);
  if (!startsAt || Number.isNaN(d.getTime())) return null;
  const zone = isValidTimeZone(timeZone) ? timeZone : undefined;
  const day = new Intl.DateTimeFormat(lang, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(zone ? { timeZone: zone } : { timeZone: "UTC" }),
  }).format(d);
  if (!zone) return day;
  const time = new Intl.DateTimeFormat(lang, { hour: "numeric", minute: "2-digit", timeZone: zone }).format(d);
  return `${day} · ${time}`;
}

export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== "string" || !/^[A-Za-z0-9_+/-]{1,64}$/.test(timeZone)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Absolute URLs for a share token. */
export function shareUrls(origin, token) {
  const base = origin.replace(/\/+$/, "");
  const t = encodeURIComponent(token);
  return {
    page: `${base}/p/${t}`,
    // Universal Link / App Link (docs/DEEP_LINKING.md) — opens the app when installed; without the
    // app it lands back on this page (vercel.json rewrite).
    openInApp: `${base}/app/p/${t}`,
    // iOS doesn't open Universal Links for same-domain taps (mywinkly.de → mywinkly.de/app/…),
    // so the page switches "Open in Winkly" to the custom scheme there (expo-router maps it to /app/p/…).
    openInAppScheme: `winkly://app/p/${t}`,
    ogImage: `${base}/p/${t}/og.png`,
  };
}

const STATUS_COPY = {
  full: ["statusFullTitle", "statusFullBody"],
  expired: ["statusExpiredTitle", "statusExpiredBody"],
  revoked: ["statusRevokedTitle", "statusRevokedBody"],
  unavailable: ["statusUnavailableTitle", "statusUnavailableBody"],
  not_found: ["statusNotFoundTitle", "statusNotFoundBody"],
  error: ["statusErrorTitle", "statusErrorBody"],
};

/** HTTP status for an RPC status. */
export function httpStatusFor(status) {
  if (status === "ok" || status === "full") return 200;
  if (status === "not_found") return 404;
  if (status === "revoked" || status === "expired" || status === "unavailable") return 410;
  return 502;
}

/** Open Graph / Twitter tags. Title + description are what WhatsApp/Telegram/iMessage show. */
export function buildMeta({ result, lang, urls }) {
  const plan = result?.status === "ok" || result?.status === "full" ? result.plan : null;
  if (!plan) {
    const key = STATUS_COPY[result?.status] ?? STATUS_COPY.error;
    return {
      title: `${tr(lang, key[0])} — Winkly`,
      description: tr(lang, "tagline"),
      image: null,
    };
  }
  const host = plan.host?.first_name;
  const when = formatWhen(plan.starts_at, plan.time_zone, lang);
  const lead = host ? tr(lang, "invitedBy", { host }) : tr(lang, "invitedAnon");
  return {
    title: `${plan.title} — ${lead}`,
    description: when ? tr(lang, "ogDescriptionWithWhen", { when }) : tr(lang, "ogDescription"),
    image: `${urls.ogImage}?l=${encodeURIComponent(lang)}`,
  };
}

function headHtml({ meta, lang, urls, styles }) {
  const tags = [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<meta name="robots" content="noindex, nofollow" />`,
    `<meta name="referrer" content="no-referrer" />`,
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Winkly" />`,
    `<meta property="og:locale" content="${escapeHtml(lang)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(urls.page)}" />`,
  ];
  if (meta.image) {
    tags.push(
      `<meta property="og:image" content="${escapeHtml(meta.image)}" />`,
      `<meta property="og:image:secure_url" content="${escapeHtml(meta.image)}" />`,
      `<meta property="og:image:type" content="image/png" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`,
    );
  } else {
    tags.push(`<meta name="twitter:card" content="summary" />`);
  }
  tags.push(
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<style>${styles}</style>`,
  );
  return tags.join("\n  ");
}

function brandHeader() {
  return `<header class="share-header">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true">W</span>
      <span>Winkly</span>
    </a>
  </header>`;
}

function footerHtml(lang) {
  return `<footer class="share-footer">
    <p>${escapeHtml(tr(lang, "tagline"))}</p>
    <p><a href="/privacy">${escapeHtml(tr(lang, "privacyLink"))}</a> · <a href="/imprint">${escapeHtml(tr(lang, "imprint"))}</a></p>
  </footer>`;
}

/**
 * Full HTML document.
 * @param {object} p
 * @param {string} p.token
 * @param {{status: string, plan?: object}} p.result  get_shared_plan() response
 * @param {string} p.lang
 * @param {string} p.origin        e.g. "https://mywinkly.de"
 * @param {string} p.supabaseUrl   for the browser's web_rsvp call
 * @param {string} p.anonKey       public anon/publishable key
 * @param {{ios?: string|null, android?: string|null}} p.stores
 * @param {string} p.styles        CSS
 */
export function renderPlanPage({ token, result, lang, origin, supabaseUrl, anonKey, stores = {}, styles = "" }) {
  const urls = shareUrls(origin, token);
  const meta = buildMeta({ result, lang, urls });
  const status = result?.status ?? "error";
  const plan = status === "ok" || status === "full" ? result.plan : null;

  let body;
  if (!plan || status === "full") {
    const [titleKey, bodyKey] = STATUS_COPY[status] ?? STATUS_COPY.error;
    body = `<article class="plan-card plan-card--status">
      ${plan ? `<p class="plan-overline">${escapeHtml(plan.title)}</p>` : ""}
      <h1 class="plan-title">${escapeHtml(tr(lang, titleKey))}</h1>
      <p class="plan-muted">${escapeHtml(tr(lang, bodyKey))}</p>
      <div class="plan-actions">
        <a class="btn btn-secondary js-open-app" href="${escapeHtml(urls.openInApp)}" data-scheme="${escapeHtml(urls.openInAppScheme)}">${escapeHtml(tr(lang, "openInApp"))}</a>
        <a class="btn btn-ghost js-get-app" href="/" hidden>${escapeHtml(tr(lang, "getApp"))}</a>
      </div>
    </article>`;
  } else {
    const host = plan.host?.first_name || null;
    const photo = safeHttpsUrl(plan.host?.photo_url);
    const when = formatWhen(plan.starts_at, plan.time_zone, lang);
    const lead = host ? tr(lang, "invitedBy", { host }) : tr(lang, "invitedAnon");
    const privacy = host ? tr(lang, "privacyLine", { host }) : tr(lang, "privacyLineAnon");
    body = `<article class="plan-card">
      <div class="plan-host">
        ${photo
          ? `<img class="plan-avatar" src="${escapeHtml(photo)}" alt="" width="48" height="48" referrerpolicy="no-referrer" />`
          : `<span class="plan-avatar plan-avatar--empty" aria-hidden="true">${escapeHtml((host ?? "W").slice(0, 1).toUpperCase())}</span>`}
        <p class="plan-lead">${escapeHtml(lead)}</p>
      </div>
      <h1 class="plan-title">${escapeHtml(plan.title)}</h1>
      <ul class="plan-meta">
        ${when ? `<li><span aria-hidden="true">🗓️</span> <time class="js-when" datetime="${escapeHtml(plan.starts_at)}">${escapeHtml(when)}</time></li>` : ""}
        ${plan.neighbourhood ? `<li><span aria-hidden="true">📍</span> ${escapeHtml(plan.neighbourhood)}</li>` : ""}
      </ul>
      ${plan.fit_line ? `<p class="plan-fit"><span aria-hidden="true">✨</span> ${escapeHtml(plan.fit_line)}</p>` : ""}

      <div class="js-rsvp-area">
        <button type="button" class="btn btn-primary js-im-in">${escapeHtml(tr(lang, "imIn"))}</button>
        <form class="rsvp-form js-rsvp-form" hidden novalidate>
          <label>${escapeHtml(tr(lang, "firstName"))}
            <input name="first_name" type="text" autocomplete="given-name" maxlength="50" required />
          </label>
          <label>${escapeHtml(tr(lang, "email"))}
            <input name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" required />
          </label>
          <button type="submit" class="btn btn-primary js-submit">${escapeHtml(tr(lang, "send"))}</button>
        </form>
      </div>
      <div class="rsvp-done js-done" hidden>
        <h2>${escapeHtml(tr(lang, "okTitle"))}</h2>
        <p>${escapeHtml(host ? tr(lang, "okBody", { host }) : tr(lang, "okBodyAnon"))}</p>
      </div>
      <p class="rsvp-error js-error" role="alert" hidden></p>

      <div class="plan-actions">
        <a class="btn btn-secondary js-open-app" href="${escapeHtml(urls.openInApp)}" data-scheme="${escapeHtml(urls.openInAppScheme)}">${escapeHtml(tr(lang, "openInApp"))}</a>
        <a class="btn btn-ghost js-get-app" href="/" hidden>${escapeHtml(tr(lang, "getApp"))}</a>
      </div>
      <p class="plan-privacy">${escapeHtml(privacy)} <a href="/privacy">${escapeHtml(tr(lang, "privacyLink"))}</a></p>
    </article>`;
  }

  const config = {
    token,
    rpcUrl: supabaseUrl ? `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/web_rsvp` : null,
    anonKey: anonKey ?? null,
    lang,
    hasTimeZone: Boolean(plan && isValidTimeZone(plan.time_zone)),
    stores: { ios: safeHttpsUrl(stores.ios), android: safeHttpsUrl(stores.android) },
    strings: {
      sending: tr(lang, "sending"),
      send: tr(lang, "send"),
      rate_limited: tr(lang, "errorRateLimited"),
      invalid_input: tr(lang, "errorInvalid"),
      network: tr(lang, "errorNetwork"),
      full: tr(lang, "statusFullBody"),
      expired: tr(lang, "statusExpiredBody"),
      revoked: tr(lang, "statusRevokedBody"),
      unavailable: tr(lang, "statusUnavailableBody"),
      not_found: tr(lang, "statusNotFoundBody"),
    },
  };

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
  ${headHtml({ meta, lang, urls, styles })}
</head>
<body class="share-body">
  ${brandHeader()}
  <main class="share-main">
    ${body}
  </main>
  ${footerHtml(lang)}
  <script id="plan-config" type="application/json">${scriptJson(config)}</script>
  <script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}

// Browser side: "I'm in" form → web_rsvp RPC (rate-limited server-side), store links, local time.
// Plain ES5-ish so it runs in in-app browsers (WhatsApp / Instagram webviews).
const CLIENT_SCRIPT = `
(function () {
  var cfg;
  try { cfg = JSON.parse(document.getElementById('plan-config').textContent); } catch (e) { return; }
  var storageKey = 'winkly_rsvp_' + cfg.token;

  // Anonymous, cookieless counters (no ids, no token) — see src/planShare/analytics.mjs.
  function beacon(event) {
    try {
      var body = JSON.stringify({ event: event, lang: cfg.lang });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/plan-event', body);
    } catch (e) {}
  }
  beacon('share_link_opened');

  // Store button: the visitor's platform store, if we know its URL.
  var ua = navigator.userAgent || '';
  var store = /iPhone|iPad|iPod/i.test(ua) ? cfg.stores.ios : /Android/i.test(ua) ? cfg.stores.android : (cfg.stores.ios || cfg.stores.android);
  Array.prototype.forEach.call(document.querySelectorAll('.js-get-app'), function (a) {
    if (store) { a.href = store; a.hidden = false; }
  });

  // iOS: same-domain taps never trigger Universal Links → use the app scheme, and fall back to the
  // App Store if the app didn't open (page still visible).
  if (/iPhone|iPad|iPod/i.test(ua)) {
    Array.prototype.forEach.call(document.querySelectorAll('.js-open-app'), function (a) {
      a.href = a.getAttribute('data-scheme');
      a.addEventListener('click', function () {
        if (!cfg.stores.ios) return;
        setTimeout(function () { if (!document.hidden) window.location.href = cfg.stores.ios; }, 1600);
      });
    });
  }

  // Older links carry no host time zone → show the time in the visitor's own zone.
  var when = document.querySelector('.js-when');
  if (when && !cfg.hasTimeZone) {
    try {
      var d = new Date(when.getAttribute('datetime'));
      var day = new Intl.DateTimeFormat(cfg.lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
      var time = new Intl.DateTimeFormat(cfg.lang, { hour: 'numeric', minute: '2-digit' }).format(d);
      when.textContent = day + ' · ' + time;
    } catch (e) {}
  }

  var btn = document.querySelector('.js-im-in');
  var form = document.querySelector('.js-rsvp-form');
  var done = document.querySelector('.js-done');
  var area = document.querySelector('.js-rsvp-area');
  var err = document.querySelector('.js-error');
  if (!btn || !form) return;

  function showDone() { area.hidden = true; done.hidden = false; err.hidden = true; }
  function showError(msg) { err.textContent = msg; err.hidden = false; }

  try { if (localStorage.getItem(storageKey) === '1') showDone(); } catch (e) {}

  btn.addEventListener('click', function () {
    btn.hidden = true; form.hidden = false;
    var first = form.querySelector('input[name="first_name"]');
    if (first) first.focus();
  });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    err.hidden = true;
    var name = form.first_name.value.trim();
    var email = form.email.value.trim();
    if (!name || name.length > 50 || !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) { showError(cfg.strings.invalid_input); return; }
    if (!cfg.rpcUrl || !cfg.anonKey) { showError(cfg.strings.network); return; }
    var submit = form.querySelector('.js-submit');
    submit.disabled = true; submit.textContent = cfg.strings.sending;
    var headers = { 'Content-Type': 'application/json', 'apikey': cfg.anonKey };
    // Legacy anon keys are JWTs and go in Authorization too; new publishable keys don't.
    if (cfg.anonKey.split('.').length === 3) headers['Authorization'] = 'Bearer ' + cfg.anonKey;
    fetch(cfg.rpcUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ p_token: cfg.token, p_first_name: name, p_email: email })
    }).then(function (res) { return res.ok ? res.json() : { status: 'network' }; })
      .then(function (data) {
        var status = data && data.status;
        if (status === 'ok') {
          try { localStorage.setItem(storageKey, '1'); } catch (e) {}
          beacon('web_rsvp_submitted');
          showDone();
          return;
        }
        showError(cfg.strings[status] || cfg.strings.network);
      })
      .catch(function () { showError(cfg.strings.network); })
      .then(function () { submit.disabled = false; submit.textContent = cfg.strings.send; });
  });
})();
`;
