/**
 * npm audit gate with a reviewed allowlist.
 *
 * Fails on any high/critical advisory that is not listed below. Every entry
 * must say why it is accepted and when to remove it — see docs/NPM_AUDIT_MOBILE.md.
 * Never "fix" these with `npm audit fix --force`: on an Expo app it swings the
 * whole SDK between unrelated majors (e.g. expo 57 -> 44 -> 57).
 *
 * Usage: node scripts/audit-check.mjs [--omit=dev]
 */
import { spawnSync } from "node:child_process";

const ACCEPTED = {
  // braces <=3.0.3: no patched release exists. Reached only through build
  // tooling (metro, @expo/cli, jest, patch-package) matching our own globs.
  // Remove when braces publishes a fix or the tooling drops it.
  "GHSA-vfj7-8cjw-p6xm": "braces",
  // node-forge <=1.4.0: no patched release exists. Used by
  // @expo/code-signing-certificates (expo-updates); the app does not configure
  // updates.codeSigningCertificate, so the vulnerable verify path is unused.
  // Remove when node-forge publishes a fix or expo-updates drops it.
  "GHSA-86w9-cpqp-85rv": "node-forge",
};

const FAIL_ON = new Set(["high", "critical"]);

const args = ["audit", "--json", ...process.argv.slice(2)];
const res = spawnSync("npm", args, { encoding: "utf8", shell: process.platform === "win32" });
let report;
try {
  report = JSON.parse(res.stdout);
} catch {
  console.error(res.stdout || res.stderr);
  console.error("[audit-check] could not parse npm audit output");
  process.exit(2);
}

const unaccepted = [];
const accepted = new Set();
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via !== "object") continue;
    const id = via.url?.split("/").pop();
    if (ACCEPTED[id]) {
      accepted.add(`${id} (${ACCEPTED[id]})`);
    } else if (FAIL_ON.has(via.severity)) {
      unaccepted.push(`${via.severity.padEnd(8)} ${name} ${via.range} — ${via.title} ${via.url}`);
    }
  }
}

const counts = report.metadata?.vulnerabilities ?? {};
console.log(`[audit-check] npm audit totals: ${JSON.stringify(counts)}`);
if (accepted.size) console.log(`[audit-check] accepted (no upstream fix): ${[...accepted].join(", ")}`);

if (unaccepted.length) {
  console.error("[audit-check] new high/critical advisories:");
  for (const line of unaccepted) console.error(`  ${line}`);
  process.exit(1);
}
console.log("[audit-check] OK — no unreviewed high/critical advisories.");
