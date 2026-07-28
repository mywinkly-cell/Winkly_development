/**
 * Root postinstall: apply mobile patches, then prune nested expo-dynamic-image-crop deps.
 * Skips cleanly when patch-package is absent (e.g. production npm install omitting devDependencies,
 * or Vercel website builds that only need the website workspace).
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const patchesDir = path.join(root, "apps", "mobile", "patches");

let patchPackageEntry;
try {
  patchPackageEntry = require.resolve("patch-package/index.js");
} catch {
  console.log(
    "[postinstall] Skipping mobile patches (patch-package not installed)."
  );
  process.exit(0);
}

if (!existsSync(patchesDir)) {
  console.log("[postinstall] Skipping — apps/mobile/patches not found.");
  process.exit(0);
}

const patch = spawnSync(
  process.execPath,
  [patchPackageEntry, "--patch-dir", "apps/mobile/patches"],
  { stdio: "inherit", cwd: root }
);
if (patch.status) process.exit(patch.status ?? 1);

const prune = spawnSync(
  process.execPath,
  [path.join(root, "scripts", "prune-expo-dynamic-image-crop-nested.mjs")],
  { stdio: "inherit", cwd: root }
);
process.exit(prune.status ?? 0);
