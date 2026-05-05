#!/usr/bin/env node
/**
 * Seed 3 fake users and create matches/connections with Kateryna (kateryna.my.wellness@gmail.com)
 * so you can test 1:1 and group chats in Romance, Friends, and Business modes.
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env or environment).
 * Run from repo root: node supabase/scripts/seed-test-users-and-matches.mjs
 *
 * The 3 test users are created with emails test1@winkly-test.local, test2@..., test3@...
 * and password TestPassword123! (for reference; you won't sign in as them).
 */

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, "");
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_EMAIL = "kateryna.my.wellness@gmail.com";

const TEST_USERS = [
  { email: "test1@winkly-test.local", firstName: "Alex", lastName: "River", city: "Munich" },
  { email: "test2@winkly-test.local", firstName: "Sam", lastName: "Taylor", city: "Berlin" },
  { email: "test3@winkly-test.local", firstName: "Jordan", lastName: "Lee", city: "Hamburg" },
];
const TEST_PASSWORD = "TestPassword123!";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in .env or environment.");
  process.exit(1);
}

const authHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
};
const restHeaders = {
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  apikey: SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

async function authFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    ...options,
    headers: { ...authHeaders, ...options.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Auth ${path}: ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function restFetch(table, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    ...options,
    headers: { ...restHeaders, ...options.headers },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`REST ${table}: ${res.status} ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function rpc(name, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { ...restHeaders, Prefer: "return=representation" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RPC ${name}: ${res.status} ${text}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log("Looking up Kateryna by email...");
  const listRes = await authFetch("/admin/users?per_page=1000");
  const allUsers = listRes?.users ?? [];
  const kateryna = allUsers.find((u) => (u.email || "").toLowerCase() === TARGET_EMAIL.toLowerCase());
  if (!kateryna) {
    console.error(`User with email ${TARGET_EMAIL} not found. Sign in once to create your account, then run this script again.`);
    process.exit(1);
  }
  const myId = kateryna.id;
  console.log("Found Kateryna:", myId);

  const fakeIds = [];
  for (const u of TEST_USERS) {
    const existing = allUsers.find((a) => (a.email || "").toLowerCase() === u.email.toLowerCase());
    if (existing) {
      console.log("Test user already exists:", u.email, existing.id);
      fakeIds.push(existing.id);
      continue;
    }
    const created = await authFetch("/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: u.email,
        password: TEST_PASSWORD,
        email_confirm: true,
      }),
    });
    if (!created?.id) throw new Error("Create user missing id");
    fakeIds.push(created.id);
    console.log("Created user:", u.email, created.id);
  }

  // public.users rows are created by trigger on auth.users insert.
  // Insert user_profiles for the 3 fakes (id, first_name, last_name, city)
  for (let i = 0; i < TEST_USERS.length; i++) {
    const u = TEST_USERS[i];
    const id = fakeIds[i];
    try {
      await restFetch("user_profiles", {
        method: "POST",
        body: JSON.stringify({
          id,
          first_name: u.firstName,
          last_name: u.lastName,
          city: u.city,
        }),
      });
    } catch (e) {
      if (e.message.includes("duplicate") || e.message.includes("23505")) {
        // already exists, try update
        await restFetch(`user_profiles?id=eq.${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            first_name: u.firstName,
            last_name: u.lastName,
            city: u.city,
          }),
        }).catch(() => {});
      } else throw e;
    }
  }
  console.log("Upserted user_profiles for test users.");

  // profiles_mode for romance, friends, business for each fake (so they show in discover)
  for (const id of fakeIds) {
    for (const mode of ["romance", "friends", "business"]) {
      await restFetch("profiles_mode", {
        method: "POST",
        headers: { ...restHeaders, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({ user_id: id, mode, bio: null, photos: [], interests: [], meta: null }),
      }).catch((e) => {
        if (e.message.includes("duplicate") || e.message.includes("23505")) return;
        throw e;
      });
    }
  }
  console.log("Upserted profiles_mode for test users.");

  // Romance: mutual likes (Kateryna ↔ each fake) → triggers create romance DMs
  for (const otherId of fakeIds) {
    await restFetch("romance_likes", {
      method: "POST",
      body: JSON.stringify([{ liker_id: myId, liked_id: otherId }, { liker_id: otherId, liked_id: myId }]),
    }).catch((e) => {
      if (e.message.includes("duplicate") || e.message.includes("23505")) return;
      throw e;
    });
  }
  console.log("Romance: mutual likes inserted (3 romance DMs should exist via trigger).");

  // Friends: mutual follows (Kateryna ↔ each fake) → trigger creates friends DMs
  for (const otherId of fakeIds) {
    await restFetch("follows", {
      method: "POST",
      body: JSON.stringify([
        { follower_id: myId, followee_id: otherId },
        { follower_id: otherId, followee_id: myId },
      ]),
    }).catch((e) => {
      if (e.message.includes("duplicate") || e.message.includes("23505")) return;
      throw e;
    });
  }
  console.log("Friends: mutual follows inserted (3 friends DMs should exist via trigger).");

  // Business: pre-create 3 business DMs (mutual follow already done; app would create on "Start chat", we create now)
  for (const otherId of fakeIds) {
    await rpc("create_direct_chat", {
      p_user_a: myId,
      p_user_b: otherId,
      p_mode: "business",
      p_source: "connection",
      p_initiator: myId,
    });
  }
  console.log("Business: 3 business DMs created via RPC.");

  console.log("\nDone. You should see:");
  console.log("  - Romance tab: 3 matches and 3 romance DMs");
  console.log("  - Friends tab: 3 connections and 3 friends DMs");
  console.log("  - Business tab: 3 connections and 3 business DMs");
  console.log("\nTest users (emails):", TEST_USERS.map((u) => u.email).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
