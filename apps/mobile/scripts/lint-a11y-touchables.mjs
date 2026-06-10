#!/usr/bin/env node
/**
 * Flags Pressable / TouchableOpacity without accessibilityLabel (or accessibilityLabelledBy).
 * Scoped to P0 surfaces from the accessibility audit; expand SCAN_DIRS as coverage grows.
 *
 * Usage: node scripts/lint-a11y-touchables.mjs
 * Exit 1 when violations are found.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.join(__dirname, "..");

/** P0 audit surfaces — CI fails only when these have violations. */
const PRIORITY_FILES = new Set([
  "components/layout/MainTabBar.tsx",
  "components/layout/ModeBottomNavShell.tsx",
  "components/layout/ModeSwitchCenterButton.tsx",
  "components/layout/ModeSelectionHeader.tsx",
  "app/(tabs)/mode-selection/index.tsx",
  "app/(auth)/signin.tsx",
  "app/(auth)/signup.tsx",
  "app/(auth)/intro.tsx",
  "components/chats/ChatComposer.tsx",
  "components/discover/DiscoverHorizontalSection.tsx",
  "components/discover/DiscoverPeopleWhoLikedYou.tsx",
  "components/discover/DiscoverRecommendedSection.tsx",
  "components/discover/DiscoverUpgradeModal.tsx",
  "components/profile/ProfileSwipeActions.tsx",
  "app/(modes)/romance/index.tsx",
  "app/(modes)/friends/index.tsx",
]);

const SCAN_DIRS = [
  "components/layout",
  "components/chats",
  "components/discover",
  "components/profile",
  "app/(auth)",
  "app/(tabs)/mode-selection",
  "app/(modes)/romance/index.tsx",
  "app/(modes)/friends/index.tsx",
];

const TOUCHABLE_RE = /<(?:Pressable|TouchableOpacity)\b/g;
const LABEL_RE = /accessibilityLabel(?:ledBy)?\s*=/;
const ROLE_NONE_OK = /accessibilityRole\s*=\s*["']none["']/;

function collectFiles(entry) {
  const abs = path.join(mobileRoot, entry);
  if (!fs.existsSync(abs)) return [];
  const stat = fs.statSync(abs);
  if (stat.isFile() && entry.endsWith(".tsx")) return [abs];
  if (!stat.isDirectory()) return [];
  const out = [];
  for (const name of fs.readdirSync(abs)) {
    if (name.startsWith(".")) continue;
    const child = path.join(abs, name);
    const childStat = fs.statSync(child);
    if (childStat.isDirectory()) out.push(...collectFiles(path.relative(mobileRoot, child)));
    else if (name.endsWith(".tsx")) out.push(child);
  }
  return out;
}

function findViolations(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split("\n");
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    if (!TOUCHABLE_RE.test(lines[i])) {
      TOUCHABLE_RE.lastIndex = 0;
      continue;
    }
    TOUCHABLE_RE.lastIndex = 0;

    // Look ahead across prop lines (avoids false positives from `=>` in handlers).
    const windowText = lines.slice(i, Math.min(i + 22, lines.length)).join("\n");
    if (ROLE_NONE_OK.test(windowText)) continue;
    if (!LABEL_RE.test(windowText)) {
      violations.push({ line: i + 1, snippet: lines[i].trim().slice(0, 100) });
    }
  }
  return violations;
}

let priorityFailed = false;
let otherCount = 0;
const files = [...new Set(SCAN_DIRS.flatMap(collectFiles))].sort();

console.log(`Scanning ${files.length} files for unlabeled touchables…\n`);

for (const file of files) {
  const rel = path.relative(mobileRoot, file).replace(/\\/g, "/");
  const violations = findViolations(file);
  if (!violations.length) continue;

  const isPriority = PRIORITY_FILES.has(rel);
  if (isPriority) priorityFailed = true;
  else otherCount += violations.length;

  console.log(`${rel}${isPriority ? " [P0]" : ""}:`);
  for (const v of violations) {
    console.log(`  L${v.line}: ${v.snippet}`);
  }
}

if (!priorityFailed && otherCount === 0) {
  console.log("No unlabeled Pressable/TouchableOpacity in scoped surfaces.");
  process.exit(0);
}

if (priorityFailed) {
  console.error("\nP0 a11y lint failed — add accessibilityLabel on priority surfaces.");
  process.exit(1);
}

console.log(`\nP0 surfaces OK. ${otherCount} non-P0 violation(s) listed above (expand coverage over time).`);
process.exit(0);
