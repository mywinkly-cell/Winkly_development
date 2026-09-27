#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// API-level regression test for SEC-12 (last names follow "show my full name")
// and for the onboarding save path that the owner-only columns affect.
//
// Unlike the .sql tests this goes through PostgREST + Auth as real signed-in
// users, so it catches what SQL alone can't: column aliases (last_name:
// last_name_public), the my_profile view, `.or()` search filters, and the fact
// that a PostgREST upsert of an owner-only column is refused (which is why the
// app writes its own profile with apps/mobile/lib/profile/writeOwnUserProfile.ts).
//
// HOW TO RUN (local stack running — `npx supabase start`):
//   node supabase/tests/name_privacy_api_test.mjs
// Reads the API URL and keys from `npx supabase status -o json` unless
// SUPABASE_API_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are set.
// Creates throwaway *@winkly-test.local users; never point it at production.
// ─────────────────────────────────────────────────────────────────────────────

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function localStackConfig() {
  if (process.env.SUPABASE_API_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      url: process.env.SUPABASE_API_URL,
      anon: process.env.SUPABASE_ANON_KEY,
      service: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
  }
  const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  return { url: status.API_URL, anon: status.ANON_KEY, service: status.SERVICE_ROLE_KEY };
}

const { url, anon, service } = localStackConfig();
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url)) {
  console.error(`Refusing to run against ${url} — this test creates users and is for the local stack only.`);
  process.exit(2);
}

const PASSWORD = "Str0ng-pass-123";
const tag = Date.now();
// Unique per run, so leftovers from an earlier run can never satisfy a search.
const HIDDEN = `Hidden${tag}`, VIEWER = `Viewer${tag}`, HOST = `Host${tag}`;
const admin = createClient(url, service);

async function signedInUser(name) {
  const email = `${name}-${tag}@winkly-test.local`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  const client = createClient(url, anon, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw signInError;
  return { id: data.user.id, c: client };
}

// Same algorithm as apps/mobile/lib/profile/writeOwnUserProfile.ts.
async function writeOwnProfile(u, cols) {
  const upd = await u.c.from("user_profiles").update(cols).eq("id", u.id).select("id");
  if (upd.error) return upd.error;
  if (upd.data.length) return null;
  const ins = await u.c.from("user_profiles").insert({ ...cols, id: u.id });
  return ins.error;
}

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}${ok ? "" : ` — ${detail}`}`);
  if (!ok) failures++;
}

const A = await signedInUser("hidden");
const B = await signedInUser("viewer");
const H = await signedInUser("host");

// ── Owner writes (onboarding / autosave) ────────────────────────────────────
const upsert = await A.c
  .from("user_profiles")
  .upsert({ id: A.id, first_name: "X", last_name: "Y", birthday: "1990-04-20" }, { onConflict: "id" });
check("a PostgREST upsert of owner-only columns is refused (why the app uses update-then-insert)", !!upsert.error, "upsert unexpectedly succeeded");

for (const [u, last] of [[A, HIDDEN], [B, VIEWER], [H, HOST]]) {
  const profile = { first_name: "Test", last_name: last, gender: "female", birthday: "1990-04-20", city: "Munich", show_full_name: false };
  const created = await writeOwnProfile(u, profile);
  check(`onboarding save creates the profile row (${last})`, !created, created?.message);
  const updated = await writeOwnProfile(u, { ...profile, city: "Berlin" });
  check(`onboarding save updates the profile row (${last})`, !updated, updated?.message);
}

const mode = await A.c.from("profiles_mode").upsert({ user_id: A.id, mode: "friends", bio: "hi" }, { onConflict: "user_id,mode" });
check("a user can save a mode profile", !mode.error, mode.error?.message);

// ── Other users see the masked last name ───────────────────────────────────
let r = await B.c.from("user_profiles").select("id, first_name, last_name:last_name_public, city").in("id", [A.id]);
check("a hidden last name reads as null", !r.error && r.data.length === 1 && r.data[0].last_name === null, JSON.stringify(r.error ?? r.data));

r = await B.c.from("user_profiles").select("id, first_name, last_name, city").in("id", [A.id]);
check("the raw last_name column is refused", !!r.error, "not refused");

r = await B.c
  .from("user_profiles")
  .select("id, first_name, last_name:last_name_public, city")
  .or(`first_name.ilike.%${HIDDEN}%,last_name_public.ilike.%${HIDDEN}%,city.ilike.%${HIDDEN}%`);
check("user search cannot find someone by a hidden last name", !r.error && r.data.length === 0, JSON.stringify(r.error ?? r.data));

r = await B.c
  .from("public_profile_view")
  .select("id, first_name, last_name, show_full_name, romance_photos, core_photos, main_photo_url")
  .in("id", [A.id]);
check("public_profile_view (Dates screen) works and is masked", !r.error && r.data.length === 1 && r.data[0].last_name === null, JSON.stringify(r.error ?? r.data));

const [core, age] = await Promise.all([
  B.c
    .from("user_profiles")
    .select("first_name, last_name:last_name_public, gender, city, education, occupation, languages, instagram, interests, core_photos, show_full_name, night_owl")
    .eq("id", A.id)
    .maybeSingle(),
  B.c.rpc("_age_from_uid", { p_id: A.id }),
]);
check("another user's profile loads with a derived age", !core.error && core.data?.first_name === "Test" && age.data >= 30, JSON.stringify(core.error ?? { core: core.data, age: age.data }));

r = await B.c.from("friend_profiles").select("user_id, first_name, last_name, age").eq("user_id", A.id);
check("friend_profiles is readable by clients", !r.error, JSON.stringify(r.error));

// ── The owner still reads their own row ────────────────────────────────────
r = await A.c.from("my_profile").select("first_name, last_name, gender, city, core_photos").eq("id", A.id).maybeSingle();
check("the owner reads their own last name (login 'profile complete' check)", !r.error && r.data?.last_name === HIDDEN, JSON.stringify(r.error ?? r.data));

r = await A.c.from("my_profile").select("id");
check("my_profile returns only the caller's row", !r.error && r.data.length === 1, JSON.stringify(r.error ?? r.data));

// ── When the full name is shown ─────────────────────────────────────────────
const optIn = await writeOwnProfile(A, { show_full_name: true });
r = await B.c.from("user_profiles").select("last_name:last_name_public").eq("id", A.id).maybeSingle();
check("an opted-in last name is visible", !optIn && r.data?.last_name === HIDDEN, JSON.stringify(optIn ?? r.error ?? r.data));

const ev = await H.c.from("events").insert({
  created_by: H.id,
  title: "Rooftop",
  mode: "events",
  visibility: "public",
  starts_at: new Date(Date.now() + 86_400_000).toISOString(),
});
r = await B.c.from("user_profiles").select("last_name:last_name_public").eq("id", H.id).maybeSingle();
check("an event host's full name is visible", !ev.error && r.data?.last_name === HOST, JSON.stringify(ev.error ?? r.error ?? r.data));

await B.c.from("profiles_mode").upsert({ user_id: B.id, mode: "business", bio: "cto" }, { onConflict: "user_id,mode" });
r = await A.c.from("user_profiles").select("first_name, last_name:last_name_public").eq("id", B.id).maybeSingle();
check("a Business profile shows the full name", !r.error && r.data?.last_name === VIEWER, JSON.stringify(r.error ?? r.data));

// Clean up the throwaway users (cascades to their rows).
for (const u of [A, B, H]) await admin.auth.admin.deleteUser(u.id);

console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
