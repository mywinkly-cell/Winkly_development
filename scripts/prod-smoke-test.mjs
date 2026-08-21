#!/usr/bin/env node
/**
 * Production smoke tests (orjccytcmklzcfjgqwwj). No secrets printed.
 * Usage: node scripts/prod-smoke-test.mjs
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://orjccytcmklzcfjgqwwj.supabase.co";
const ANON =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9yamNjeXRjbWtsemNmamdxd3dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MDc3MzAsImV4cCI6MjA5NjI4MzczMH0.n1Dku22r5tWiGm_xcEm_mOAoXhWaRHmswN3oOBf9re8";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, "supabase/functions/.env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .map((line) => {
      const i = line.indexOf("=");
      if (i < 1 || line.startsWith("#")) return null;
      return [line.slice(0, i), line.slice(i + 1)];
    })
    .filter(Boolean),
);

const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (e) {
    results.push({ name, ok: false, detail: e.message ?? String(e) });
  }
}

await check("auth-redirect CSRF mint", async () => {
  const r = await fetch(`${BASE}/functions/v1/auth-redirect?action=mint`);
  const j = await r.json();
  if (r.status !== 200 || typeof j.state !== "string" || j.state.length < 8) {
    throw new Error(`status=${r.status} body=${JSON.stringify(j).slice(0, 120)}`);
  }
  return `200, state length ${j.state.length}`;
});

await check("notify-fanout rejects bad webhook", async () => {
  const r = await fetch(`${BASE}/functions/v1/notify-fanout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-webhook-secret": "invalid" },
    body: "{}",
  });
  if (r.status !== 401) throw new Error(`expected 401, got ${r.status}`);
  return "401 Unauthorized";
});

await check("get-nearby-external-events (Eventbrite path)", async () => {
  const r = await fetch(`${BASE}/functions/v1/get-nearby-external-events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ latitude: 52.52, longitude: 13.405, radius_km: 25 }),
  });
  const j = await r.json();
  if (r.status !== 200) throw new Error(`status=${r.status} ${JSON.stringify(j).slice(0, 200)}`);
  const events = j.events ?? [];
  const platforms = [...new Set(events.map((e) => e.externalPlatform))];
  return `200, ${events.length} events, platforms: ${platforms.join(", ") || "none"}`;
});

await check("ai-gateway requires user session", async () => {
  const r = await fetch(`${BASE}/functions/v1/ai-gateway`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ANON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "romance", task: "plan", context: {} }),
  });
  const j = await r.json();
  if (r.status !== 401 || j.error !== "Invalid session") {
    throw new Error(`expected 401 Invalid session, got ${r.status} ${JSON.stringify(j)}`);
  }
  return "401 Invalid session (expected for anon key)";
});

await check("Upstash REST PING", async () => {
  const url = env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error("UPSTASH_* not in supabase/functions/.env");
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(["PING"]),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${JSON.stringify(j).slice(0, 120)}`);
  const pong = j.result ?? j;
  if (pong !== "PONG" && JSON.stringify(j).indexOf("PONG") < 0) {
    throw new Error(`unexpected: ${JSON.stringify(j).slice(0, 120)}`);
  }
  return "PONG";
});

console.log("\nProduction smoke tests — orjccytcmklzcfjgqwwj\n");
for (const { name, ok, detail } of results) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  console.log(`       ${detail}\n`);
}
const failed = results.filter((r) => !r.ok).length;
process.exit(failed ? 1 : 0);
