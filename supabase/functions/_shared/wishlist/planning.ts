// ─────────────────────────────────────────────────────────────────────────────
// Wishlist → plan suggestions. Pure logic shared by ai-gateway (Deno) and the mobile
// Jest suite (apps/mobile/__tests__/wishlistPlanning.test.ts). Import-free on purpose.
//
// When someone plans with Winkly AI, places they (and, if shared, the other person)
// saved earlier are offered first: "There are places in your wish lists — how about X?"
//
//   pickWishlistForPlan    — which saved places fit this plan (city), whose they are
//   wishlistPromptBlock    — the compact list the model sees (ids W1…, never user ids)
//   resolveWishlistRef     — validate the model's `wishlist_ref` against that list
// ─────────────────────────────────────────────────────────────────────────────

export type WishlistOwner = "you" | "partner" | "both";

export type WishlistRow = {
  owner_id: string;
  title: string;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  place_id?: string | null;
  image_url?: string | null;
  url?: string | null;
};

export type WishlistCandidate = {
  /** Stable per-response id the model may cite ("W1"). */
  ref: string;
  title: string;
  owner: WishlistOwner;
  address: string | null;
  city: string | null;
  place_id: string | null;
  image_url: string | null;
  url: string | null;
  note: string | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "München" ≈ "Munich" ≈ "Munchen": a few common exonyms so city matching isn't brittle. */
const CITY_ALIASES: Record<string, string> = {
  munich: "munchen",
  cologne: "koln",
  vienna: "wien",
  prague: "praha",
  warsaw: "warszawa",
  kyiv: "kyiv",
  kiev: "kyiv",
  rome: "roma",
  milan: "milano",
  lisbon: "lisboa",
  copenhagen: "kobenhavn",
  nuremberg: "nurnberg",
  zurich: "zurich",
};

export function sameCity(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  const cx = CITY_ALIASES[x] ?? x;
  const cy = CITY_ALIASES[y] ?? y;
  return cx === cy || cx.startsWith(cy + " ") || cy.startsWith(cx + " ");
}

function placeKey(r: WishlistRow): string {
  return r.place_id ? `p:${r.place_id}` : `t:${norm(r.title)}|${norm(r.city)}`;
}

/** True when the saved place plausibly lies in the plan's city (unknown city counts as "maybe"). */
function inPlanCity(r: WishlistRow, planCity: string | null | undefined): boolean {
  if (!planCity) return true;
  if (r.city) return sameCity(r.city, planCity);
  const addr = norm(r.address);
  if (addr) return addr.includes(CITY_ALIASES[norm(planCity)] ?? norm(planCity)) || addr.includes(norm(planCity));
  return true;
}

/**
 * Saved places that fit this plan, merged across people. A place both saved is "both" and
 * ranks first, then the partner's (a thoughtful gesture), then yours. Items located in
 * another city are dropped; items with no location stay (the model judges by name).
 */
export function pickWishlistForPlan(
  rows: WishlistRow[],
  opts: { requesterId: string; planCity?: string | null; max?: number },
): WishlistCandidate[] {
  const max = Math.max(0, Math.min(10, opts.max ?? 6));
  const byKey = new Map<string, { row: WishlistRow; owners: Set<"you" | "partner">; located: boolean }>();
  for (const r of rows) {
    if (!r || typeof r.title !== "string" || !r.title.trim()) continue;
    if (!inPlanCity(r, opts.planCity)) continue;
    const key = placeKey(r);
    const who = r.owner_id === opts.requesterId ? "you" : "partner";
    const located = !!(r.place_id || r.city || r.address);
    const cur = byKey.get(key);
    if (cur) cur.owners.add(who);
    else byKey.set(key, { row: r, owners: new Set([who]), located });
  }
  const rank = (owners: Set<string>) => (owners.size > 1 ? 0 : owners.has("partner") ? 1 : 2);
  return Array.from(byKey.values())
    .sort((a, b) => rank(a.owners) - rank(b.owners) || Number(b.located) - Number(a.located))
    .slice(0, max)
    .map((e, i) => ({
      ref: `W${i + 1}`,
      title: e.row.title.trim().slice(0, 120),
      owner: (e.owners.size > 1 ? "both" : e.owners.has("partner") ? "partner" : "you") as WishlistOwner,
      address: e.row.address?.trim().slice(0, 180) || null,
      city: e.row.city?.trim().slice(0, 80) || null,
      place_id: e.row.place_id?.trim() || null,
      image_url: e.row.image_url && /^https:\/\//i.test(e.row.image_url) ? e.row.image_url : null,
      url: e.row.url && /^https?:\/\//i.test(e.row.url) ? e.row.url : null,
      note: e.row.description?.trim().slice(0, 140) || null,
    }));
}

/** What the model sees: ids, names, area, whose — no user ids, links or images. */
export function wishlistPromptBlock(cands: WishlistCandidate[]): Array<Record<string, string>> {
  return cands.map((c) => ({
    id: c.ref,
    name: c.title,
    saved_by: c.owner === "both" ? "both of you" : c.owner === "partner" ? "the other person" : "the requester",
    ...(c.address || c.city ? { area: [c.address, c.city].filter(Boolean).join(", ") } : {}),
    ...(c.note ? { note: c.note } : {}),
  }));
}

/** The model's `wishlist_ref` → the candidate it names, or null if absent/invented. */
export function resolveWishlistRef(ref: unknown, cands: WishlistCandidate[]): WishlistCandidate | null {
  if (typeof ref !== "string") return null;
  const id = ref.trim().toUpperCase();
  return cands.find((c) => c.ref === id) ?? null;
}

/** Instruction appended to the planner system prompt when WISHLIST_PLACES is present. */
export const WISHLIST_PROMPT_RULE =
  "- WISHLIST_PLACES lists real places the participants saved to visit someday. When one fits the request, the city, the time and the weather, build Option A around it (prefer one saved by both, then by the other person), use that place as the venue, and set \"wishlist_ref\" on that option to its id (e.g. \"W1\"). Mention in fit_reason that it is from their wish list. Never set wishlist_ref for a place that is not in WISHLIST_PLACES, and never force a place that doesn't fit.";
