/**
 * Verify legal URLs return 200 and expected Winkly content.
 * Usage:
 *   node scripts/verify-links.mjs                  # production winkly.app
 *   node scripts/verify-links.mjs --base http://localhost:4173
 */

const DEFAULT_BASE = "https://winkly.app";

const CHECKS = [
  { path: "/terms", mustInclude: ["Winkly Technologies", "Germany"] },
  { path: "/privacy", mustInclude: ["Winkly Technologies", "GDPR"] },
  { path: "/privacy#cookies", mustInclude: ["Cookies", "PostHog"] },
  { path: "/community", mustInclude: ["Community Guidelines", "respectful"] },
  { path: "/imprint", mustInclude: ["Impressum", "Winkly Technologies"] },
];

function parseArgs() {
  const idx = process.argv.indexOf("--base");
  const base = idx >= 0 ? process.argv[idx + 1] : DEFAULT_BASE;
  return { base: base.replace(/\/$/, "") };
}

async function fetchText(url) {
  const res = await fetch(url, { redirect: "follow" });
  const text = await res.text();
  return { status: res.status, text, url: res.url };
}

async function main() {
  const { base } = parseArgs();
  let failed = 0;

  console.log(`Verifying legal pages at ${base}\n`);

  for (const check of CHECKS) {
    const url = `${base}${check.path}`;
    try {
      const { status, text, url: finalUrl } = await fetchText(url);
      const missing = check.mustInclude.filter((s) => !text.includes(s));
      const ok = status === 200 && missing.length === 0;
      const icon = ok ? "✓" : "✗";
      console.log(`${icon} ${check.path} → ${status}${finalUrl !== url ? ` (${finalUrl})` : ""}`);
      if (!ok) {
        failed += 1;
        if (status !== 200) console.log(`    Expected HTTP 200, got ${status}`);
        if (missing.length) console.log(`    Missing content: ${missing.join(", ")}`);
        if (text.includes("baby") || text.includes("Sleep Intelligence")) {
          console.log("    WARNING: Page appears to be the old unrelated Winkly sleep app — redeploy website/");
        }
      }
    } catch (err) {
      failed += 1;
      console.log(`✗ ${check.path} → ERROR: ${err.message}`);
    }
  }

  console.log("");
  if (failed) {
    console.error(`${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("All legal links verified.");
}

main();
