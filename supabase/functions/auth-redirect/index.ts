// auth-redirect — Email verification / magic-link bridge to winkly://callback
// verify_jwt = false in config.toml (browser links have no Bearer JWT).
// CSRF: signed winkly_state query param (mint via ?action=mint).

import {
  isAuthRedirectStateConfigured,
  mintAuthRedirectState,
  verifyAuthRedirectState,
} from "../_shared/authRedirectState.ts";

function buildRedirectHtml(winklyState: string | null): string {
  const stateQuery =
    winklyState != null && winklyState.length > 0
      ? `?winkly_state=${encodeURIComponent(winklyState)}`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Opening Winkly</title>
  <style>
    body{font-family:-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F9F7FB;color:#1C1C1E;padding:24px;box-sizing:border-box}
    .spinner{width:48px;height:48px;border:4px solid #E5E5EA;border-top-color:#5A189A;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:16px}
    @keyframes spin{to{transform:rotate(360deg)}}
    p{margin:8px 0;color:#555;text-align:center}
    a{color:#5A189A;font-weight:600;word-break:break-all}
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p id="msg">Opening Winkly app...</p>
  <p id="hint" style="display:none;font-size:14px;color:#888">If nothing happens, tap the menu (3 dots) and choose "Open in Chrome" or "Open in Safari", then return here.</p>
  <script>
(function(){
  var STATE_QUERY = ${JSON.stringify(stateQuery)};
  function parseParams(body){
    var out = {};
    if (!body) return out;
    body.split('&').forEach(function(pair){
      var i = pair.indexOf('=');
      if (i < 0) return;
      var k = decodeURIComponent(pair.slice(0, i).replace(/\\+/g, ' '));
      var v = decodeURIComponent(pair.slice(i + 1).replace(/\\+/g, ' '));
      if (k) out[k] = v;
    });
    return out;
  }
  function escHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }
  function looksLikeAccessJwt(token){
    if (typeof token !== 'string') return false;
    var parts = token.split('.');
    return parts.length === 3 && parts.every(function(p){ return p.length > 0; });
  }
  var hash = window.location.hash;
  var search = window.location.search || '';
  var q = parseParams(search.replace(/^\\?/, ''));
  if (q.error) {
    var m0 = document.getElementById('msg');
    var hint0 = document.getElementById('hint');
    var extra = q.error_description ? escHtml(q.error_description.replace(/\\+/g, ' ')) : '';
    m0.innerHTML = 'Sign-in did not complete (' + escHtml(q.error) + '). ' + (extra ? extra + ' ' : '') + '<a href="winkly://">Open Winkly</a> to try again.';
    if (hint0) hint0.style.display = 'block';
    return;
  }
  var fragment = hash || (search ? '#' + search.replace(/^\\?/, '') : '');
  var fragBody = fragment.indexOf('#') === 0 ? fragment.slice(1) : fragment.replace(/^#/, '');
  var fragParams = parseParams(fragBody);
  var deepLink = 'winkly://callback' + STATE_QUERY + fragment;
  var sameUrl = window.location.href;
  var hasSessionToken = looksLikeAccessJwt(fragParams.access_token);
  function showFallback(){
    var m = document.getElementById('msg');
    var h = document.getElementById('hint');
    if (fragment && hasSessionToken) {
      m.innerHTML = 'If Winkly did not open, <a href="' + deepLink.replace(/"/g, '&quot;') + '">tap here to try again</a>. Or <a href="' + sameUrl + '" target="_blank">open in Chrome/Safari</a> and try there.';
    } else {
      m.innerHTML = 'This link may have expired. <a href="winkly://">Open Winkly</a> and sign in to continue.';
    }
    if(h) h.style.display = 'block';
  }
  if (fragment && hasSessionToken) {
    window.location.href = deepLink;
    setTimeout(showFallback, 2500);
  } else {
    showFallback();
  }
})();
  </script>
</body>
</html>`;
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy":
    "default-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
  "Cache-Control": "no-store, no-cache",
};

const INVALID_STATE_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Invalid link</title></head>
<body style="font-family:-apple-system,sans-serif;padding:24px;text-align:center">
<p>This sign-in link is invalid or has expired.</p>
<p><a href="winkly://">Open Winkly</a> and request a new verification email.</p>
</body></html>`;

Deno.serve(async (req) => {
  const { corsHeaders } = await import("../_shared/cors.ts");
  const url = new URL(req.url);

  const baseHeaders = (extra: Record<string, string> = {}) => ({
    ...SECURITY_HEADERS,
    ...extra,
    ...Object.fromEntries(corsHeaders(req, { methods: "GET, OPTIONS", headers: "Content-Type, Accept" })),
  });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: baseHeaders() });
  }

  if (req.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: baseHeaders({ Allow: "GET, OPTIONS" }),
    });
  }

  if (url.searchParams.get("action") === "mint") {
    const state = await mintAuthRedirectState();
    if (!state) {
      return new Response(
        JSON.stringify({
          error: "AUTH_REDIRECT_STATE_SECRET not configured",
          hint: "Set AUTH_REDIRECT_STATE_SECRET in Supabase Edge Function secrets (min 16 chars).",
        }),
        {
          status: 503,
          headers: baseHeaders({ "Content-Type": "application/json" }),
        },
      );
    }
    return new Response(JSON.stringify({ state }), {
      status: 200,
      headers: baseHeaders({ "Content-Type": "application/json" }),
    });
  }

  const winklyState = url.searchParams.get("winkly_state");
  if (isAuthRedirectStateConfigured()) {
    const ok = await verifyAuthRedirectState(winklyState);
    if (!ok) {
      return new Response(INVALID_STATE_HTML, {
        status: 403,
        headers: baseHeaders({ "Content-Type": "text/html; charset=UTF-8" }),
      });
    }
  }

  return new Response(buildRedirectHtml(winklyState), {
    status: 200,
    headers: baseHeaders({ "Content-Type": "text/html; charset=UTF-8" }),
  });
});
