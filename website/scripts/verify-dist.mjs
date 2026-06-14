/**
 * Verify built legal pages in website/dist (no server or domain required).
 * Usage: node scripts/verify-dist.mjs
 * Run after `npm run build`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "..", "dist");

const CHECKS = [
  { path: "/terms", file: "terms/index.html", mustInclude: ["Winkly Technologies", "Germany"] },
  { path: "/privacy", file: "privacy/index.html", mustInclude: ["Winkly Technologies", "GDPR"] },
  { path: "/privacy#cookies", file: "privacy/index.html", mustInclude: ["Cookies", "PostHog"] },
  { path: "/community", file: "community/index.html", mustInclude: ["Community Guidelines", "respectful"] },
  { path: "/imprint", file: "imprint/index.html", mustInclude: ["Impressum", "Winkly Technologies"] },
  { path: "/auth", file: "auth/index.html", mustInclude: ["winkly://callback", "winkly_state"] },
];

function main() {
  if (!fs.existsSync(DIST)) {
    console.error(`dist/ not found at ${DIST}. Run: npm run build`);
    process.exit(1);
  }

  let failed = 0;
  console.log(`Verifying built legal pages in ${DIST}\n`);

  for (const check of CHECKS) {
    const filePath = path.join(DIST, check.file);
    if (!fs.existsSync(filePath)) {
      failed += 1;
      console.log(`✗ ${check.path} → missing file: ${check.file}`);
      continue;
    }

    const text = fs.readFileSync(filePath, "utf8");
    const missing = check.mustInclude.filter((s) => !text.includes(s));
    const ok = missing.length === 0;
    console.log(`${ok ? "✓" : "✗"} ${check.path} → ${check.file}`);
    if (!ok) {
      failed += 1;
      console.log(`    Missing content: ${missing.join(", ")}`);
    }
    if (text.includes("Sleep Intelligence")) {
      failed += 1;
      console.log("    WARNING: Page appears to be unrelated legacy content — rebuild from docs/");
    }
  }

  const entityPath = path.join(DIST, "..", "legal-entity.json");
  if (fs.existsSync(entityPath)) {
    const entity = JSON.parse(fs.readFileSync(entityPath, "utf8"));
    const placeholders = Object.entries(entity).filter(([, v]) =>
      typeof v === "string" && (v.includes("[") || v.includes("update before launch"))
    );
    if (placeholders.length) {
      console.log(
        `\n⚠ legal-entity.json still has ${placeholders.length} placeholder field(s) — update before public launch.`
      );
    }
  }

  console.log("");
  if (failed) {
    console.error(`${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("All built legal pages verified (ready to deploy when you have a host/domain).");
}

main();
