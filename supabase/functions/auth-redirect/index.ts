// auth-redirect — Serves the redirect page for email verification links.
// In-app browsers (Gmail, etc.) may show HTML as source or block deep links.
// Add https://YOUR_PROJECT.supabase.co/functions/v1/auth-redirect to Supabase Redirect URLs.

const HTML = `<!DOCTYPE html>
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
    .btn{display:inline-block;margin-top:16px;padding:12px 24px;background:#5A189A;color:#FFD60A;text-decoration:none;border-radius:12px;font-weight:600}
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p id="msg">Opening Winkly app...</p>
  <p id="hint" style="display:none;font-size:14px;color:#888">If nothing happens, tap the menu (3 dots) and choose "Open in Chrome" or "Open in Safari", then return here.</p>
  <script>
(function(){
  var hash = window.location.hash;
  var search = window.location.search;
  var fragment = hash || (search ? '#' + search.replace(/^\\?/, '') : '');
  var deepLink = 'winkly://callback' + fragment;
  var sameUrl = window.location.href;
  function showFallback(){
    var m = document.getElementById('msg');
    var h = document.getElementById('hint');
    if (fragment && fragment.indexOf('access_token') !== -1) {
      m.innerHTML = 'If Winkly did not open, <a href="' + deepLink.replace(/"/g, '&quot;') + '">tap here to try again</a>. Or <a href="' + sameUrl + '" target="_blank">open in Chrome/Safari</a> and try there.';
    } else {
      m.innerHTML = 'This link may have expired. <a href="winkly://">Open Winkly</a> and sign in to continue.';
    }
    if(h) h.style.display = 'block';
  }
  if (fragment && fragment.indexOf('access_token') !== -1) {
    window.location.href = deepLink;
    setTimeout(showFallback, 2500);
  } else {
    showFallback();
  }
})();
  </script>
</body>
</html>`;

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  // Inline script only; no remote loads.
  "Content-Security-Policy":
    "default-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
  "Cache-Control": "no-store, no-cache",
};

Deno.serve(async (req) => {
  const { corsHeaders } = await import("../_shared/cors.ts");

  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...SECURITY_HEADERS,
        ...Object.fromEntries(corsHeaders(req, { methods: "GET, OPTIONS", headers: "Content-Type" })),
      },
    });
  }

  if (req.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: {
        Allow: "GET, OPTIONS",
        ...SECURITY_HEADERS,
        ...Object.fromEntries(corsHeaders(req, { methods: "GET, OPTIONS", headers: "Content-Type" })),
      },
    });
  }

  return new Response(HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=UTF-8",
      ...SECURITY_HEADERS,
      ...Object.fromEntries(corsHeaders(req, { methods: "GET, OPTIONS", headers: "Content-Type" })),
    },
  });
});
