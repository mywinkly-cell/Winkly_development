#!/usr/bin/env node
/**
 * Upload auth-redirect/index.html to Supabase Storage.
 * Run from project root: node scripts/upload-auth-redirect.mjs
 *
 * Prerequisites:
 * 1. Create bucket "auth-redirect" in Supabase Dashboard → Storage (enable Public bucket)
 * 2. Set SUPABASE_SERVICE_ROLE_KEY in apps/mobile/.env (from Supabase → Settings → API)
 *    (Anon key may not have upload permission; service role works for sure)
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const envPath = join(projectRoot, "apps", "mobile", ".env");

function loadEnv() {
  try {
    const env = readFileSync(envPath, "utf8");
    const vars = {};
    for (const line of env.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) vars[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return vars;
  } catch {
    return process.env;
  }
}

const env = loadEnv();
const url = env.EXPO_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing EXPO_PUBLIC_SUPABASE_URL and key in apps/mobile/.env");
  process.exit(1);
}

const supabase = createClient(url, key);
const BUCKET = "auth-redirect";
const htmlPath = join(projectRoot, "auth-redirect", "index.html");

async function main() {
  const html = readFileSync(htmlPath, "utf8");
  const blob = new Blob([html], { type: "text/html" });

  try {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload("index.html", blob, { contentType: "text/html", upsert: true });

    if (error) {
      if (error.message?.includes("Bucket not found") || error.message?.includes("does not exist") || error.message?.includes("not found")) {
        console.error(`
Create the bucket first:
1. Supabase Dashboard → Storage → New bucket
2. Name: auth-redirect
3. Enable "Public bucket"
4. Create
5. Run this script again.
`);
      } else {
        console.error("Upload failed:", error.message);
        console.error("Tip: Use SUPABASE_SERVICE_ROLE_KEY from Supabase → Settings → API");
      }
      process.exit(1);
    }

    const publicUrl = `${url}/storage/v1/object/public/${BUCKET}/index.html`;
    console.log("\n✅ Uploaded! Add to Supabase Redirect URLs and .env:\n" + publicUrl + "\n");
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
