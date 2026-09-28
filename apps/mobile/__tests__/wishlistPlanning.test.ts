// Wishlist → AI plan suggestions: which saved places are offered, in what order, and how
// the model's reference to one is validated.

import {
  pickWishlistForPlan,
  resolveWishlistRef,
  sameCity,
  wishlistPromptBlock,
  type WishlistRow,
} from "../../../supabase/functions/_shared/wishlist/planning";

const ME = "me";
const PARTNER = "partner";

describe("sameCity", () => {
  it("matches local names, English exonyms and accents", () => {
    expect(sameCity("München", "Munich")).toBe(true);
    expect(sameCity("munchen", "München")).toBe(true);
    expect(sameCity("Köln", "Cologne")).toBe(true);
    expect(sameCity("Berlin", "Munich")).toBe(false);
    expect(sameCity("", "Munich")).toBe(false);
  });
});

describe("pickWishlistForPlan", () => {
  const rows: WishlistRow[] = [
    { owner_id: ME, title: "Rooftop bar", city: "München" },
    { owner_id: PARTNER, title: "Tiny jazz club", city: "Munich" },
    { owner_id: ME, title: "Berlin museum", city: "Berlin" },
    { owner_id: ME, title: "Café Luitpold", place_id: "P1" },
    { owner_id: PARTNER, title: "Cafe Luitpold", place_id: "P1" },
    { owner_id: ME, title: "Some idea from a reel" },
  ];

  it("keeps places in the plan's city, merges shared saves and ranks both > partner > you", () => {
    const out = pickWishlistForPlan(rows, { requesterId: ME, planCity: "Munich" });
    expect(out.map((c) => [c.ref, c.title, c.owner])).toEqual([
      ["W1", "Café Luitpold", "both"],
      ["W2", "Tiny jazz club", "partner"],
      ["W3", "Rooftop bar", "you"],
      ["W4", "Some idea from a reel", "you"],
    ]);
  });

  it("respects the max", () => {
    expect(pickWishlistForPlan(rows, { requesterId: ME, planCity: "Munich", max: 2 })).toHaveLength(2);
  });

  it("drops unsafe links and images", () => {
    const [c] = pickWishlistForPlan(
      [{ owner_id: ME, title: "X", url: "javascript:alert(1)", image_url: "http://insecure/img.jpg" }],
      { requesterId: ME }
    );
    expect(c.url).toBeNull();
    expect(c.image_url).toBeNull();
  });
});

describe("wishlistPromptBlock", () => {
  it("never exposes user ids or links to the model", () => {
    const cands = pickWishlistForPlan(
      [{ owner_id: PARTNER, title: "Tiny jazz club", city: "Munich", url: "https://x.example" }],
      { requesterId: ME }
    );
    const block = wishlistPromptBlock(cands);
    expect(block).toEqual([{ id: "W1", name: "Tiny jazz club", saved_by: "the other person", area: "Munich" }]);
    expect(JSON.stringify(block)).not.toContain(PARTNER);
  });
});

describe("resolveWishlistRef", () => {
  const cands = pickWishlistForPlan([{ owner_id: ME, title: "Rooftop bar" }], { requesterId: ME });
  it("accepts a listed id (any case) and rejects invented ones", () => {
    expect(resolveWishlistRef("w1", cands)?.title).toBe("Rooftop bar");
    expect(resolveWishlistRef("W9", cands)).toBeNull();
    expect(resolveWishlistRef(undefined, cands)).toBeNull();
  });
});
