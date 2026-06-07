#!/usr/bin/env node
/**
 * expo-dynamic-image-crop bundles outdated nested native deps in its lock tree.
 * After patch-package bumps its dependency ranges, prune the nested install so
 * Metro/native builds resolve the workspace-hoisted SDK versions.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const nested = path.join(root, "node_modules", "expo-dynamic-image-crop", "node_modules");

if (fs.existsSync(nested)) {
  fs.rmSync(nested, { recursive: true, force: true });
  console.log("prune-expo-dynamic-image-crop: removed nested node_modules");
}
