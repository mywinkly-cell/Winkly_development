import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(ROOT, "..");
const DOCS = path.join(REPO_ROOT, "docs");
const DIST = path.join(ROOT, "dist");

const PAGES = [
  { slug: "terms", source: "TERMS_OF_SERVICE.md", title: "Terms of Service" },
  { slug: "privacy", source: "PRIVACY_POLICY.md", title: "Privacy Policy" },
  { slug: "imprint", source: "IMPRINT.md", title: "Imprint (Impressum)" },
  { slug: "community", source: "COMMUNITY_GUIDELINES.md", title: "Community Guidelines" },
];

const entity = JSON.parse(fs.readFileSync(path.join(ROOT, "legal-entity.json"), "utf8"));
const styles = fs.readFileSync(path.join(ROOT, "src", "styles.css"), "utf8");

marked.setOptions({ gfm: true, headerIds: true, mangle: false });

function substituteEntity(text) {
  return text.replace(/\{\{company\.(\w+)\}\}/g, (_, key) => entity[key] ?? "");
}

function rewriteLinks(markdown) {
  return markdown
    .replace(/\]\(TERMS_OF_SERVICE\.md\)/g, "](/terms)")
    .replace(/\]\(PRIVACY_POLICY\.md\)/g, "](/privacy)")
    .replace(/\]\(COMMUNITY_GUIDELINES\.md\)/g, "](/community)")
    .replace(/\]\(IMPRINT\.md\)/g, "](/imprint)");
}

function navHtml(active) {
  const links = [
    ["Terms", "/terms"],
    ["Privacy", "/privacy"],
    ["Community", "/community"],
    ["Imprint", "/imprint"],
  ];
  return links
    .map(([label, href]) => `<a href="${href}"${href === active ? ' aria-current="page"' : ""}>${label}</a>`)
    .join("\n        ");
}

function wrapPage({ title, bodyHtml, activePath = "" }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Winkly</title>
  <meta name="description" content="${title} for Winkly — dating, friends, business, and events." />
  <style>${styles}</style>
</head>
<body>
  <header class="site-header">
    <div class="site-header-inner">
      <a class="brand" href="/">
        <span class="brand-mark" aria-hidden="true">W</span>
        <span>Winkly</span>
      </a>
      <nav class="nav-links" aria-label="Legal">
        ${navHtml(activePath)}
      </nav>
    </div>
  </header>
  <main>
    ${bodyHtml}
  </main>
  <footer class="site-footer">
    © ${new Date().getFullYear()} ${entity.legalName}. Contact: <a href="mailto:${entity.contactEmail}">${entity.contactEmail}</a>
  </footer>
</body>
</html>`;
}

function renderMarkdown(markdown) {
  const prepared = rewriteLinks(substituteEntity(markdown));
  return marked.parse(prepared);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writePage(slug, html) {
  const dir = path.join(DIST, slug);
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
}

// Static email-verification / magic-link bridge served at https://mywinkly.de/auth.
// Mirrors supabase/functions/auth-redirect (and auth-redirect/index.html): forwards the
// auth token fragment to the winkly://callback deep link, preserving winkly_state from the
// query string. A static host cannot verify the signed winkly_state (no secret), so the
// mobile app still re-checks it client-side (lib/authRedirectUrl.ts). To switch email links
// here, set EXPO_PUBLIC_AUTH_REDIRECT_URL=https://mywinkly.de/auth.
const AUTH_REDIRECT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Opening Winkly</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F9F7FB;color:#1C1C1E;padding:24px;box-sizing:border-box}
    .spinner{width:48px;height:48px;border:4px solid #E5E5EA;border-top-color:#5A189A;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:16px}
    @keyframes spin{to{transform:rotate(360deg)}}
    p{margin:8px 0;color:#555;text-align:center}
    a{color:#5A189A;font-weight:600;word-break:break-all}
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p id="msg">Opening Winkly app...</p>
  <p id="hint" style="display:none;font-size:14px;color:#888">If nothing happens, tap the menu and choose "Open in Chrome" or "Open in Safari", then return here.</p>
  <script>
(function(){
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
  var stateQuery = q.winkly_state ? '?winkly_state=' + encodeURIComponent(q.winkly_state) : '';
  var fragment = hash || (search ? '#' + search.replace(/^\\?/, '') : '');
  var fragBody = fragment.indexOf('#') === 0 ? fragment.slice(1) : fragment.replace(/^#/, '');
  var fragParams = parseParams(fragBody);
  var deepLink = 'winkly://callback' + stateQuery + fragment;
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

function buildAuthRedirect() {
  const dir = path.join(DIST, "auth");
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, "index.html"), AUTH_REDIRECT_HTML, "utf8");
}

function buildLanding() {
  const body = `
    <div class="card">
      <h1 class="page-title">Winkly</h1>
      <p class="page-meta">Plan dates, meetups, business connections, and events — with AI when you want a hand.</p>
      <p>Legal information for the Winkly mobile app and related services operated by ${entity.legalName}.</p>
      <div class="landing-links">
        <a href="/terms">Terms of Service</a>
        <a href="/privacy">Privacy Policy</a>
        <a href="/privacy#cookies">Cookie notice</a>
        <a href="/community">Community Guidelines</a>
        <a href="/imprint">Imprint (Impressum)</a>
      </div>
    </div>`;
  fs.writeFileSync(path.join(DIST, "index.html"), wrapPage({ title: "Legal", bodyHtml: body }), "utf8");
}

function build() {
  if (fs.existsSync(DIST)) {
    fs.rmSync(DIST, { recursive: true, force: true });
  }
  ensureDir(DIST);

  for (const page of PAGES) {
    const sourcePath = path.join(DOCS, page.source);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing source: ${sourcePath}`);
    }
    const markdown = fs.readFileSync(sourcePath, "utf8");
    const content = renderMarkdown(markdown);
    const body = `
    <article class="card prose">
      <h1 class="page-title">${page.title}</h1>
      ${content}
    </article>`;
    writePage(page.slug, wrapPage({ title: page.title, bodyHtml: body, activePath: `/${page.slug}` }));
  }

  buildLanding();
  buildAuthRedirect();
  console.log(`Built ${PAGES.length + 2} pages → ${DIST}`);
}

build();
