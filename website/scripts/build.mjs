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
  console.log(`Built ${PAGES.length + 1} pages → ${DIST}`);
}

build();
