// Events catalogue: merging the same event from several providers into one item with a
// list of booking options, venue-type inference and per-user ranking.

import {
  inferVenueType,
  isSameEvent,
  mergeDuplicateEvents,
  rankForProfile,
  sortOffers,
  type RawCatalogEvent,
} from "../../../supabase/functions/_shared/events/catalog";

const base: RawCatalogEvent = {
  id: "ticketmaster_1",
  title: "Coldplay – Music of the Spheres World Tour",
  startAt: "2026-10-10T18:00:00Z",
  venueName: "Olympiastadion München",
  latitude: 48.1731,
  longitude: 11.5466,
  imageUrl: "https://img.example.com/tm.jpg",
  offer: { platform: "ticketmaster", url: "https://tm.example.com/1", priceMin: 89, currency: "EUR" },
};

describe("isSameEvent", () => {
  it("matches the same concert listed on two platforms with slightly different titles", () => {
    const other: RawCatalogEvent = {
      id: "eventbrite_9",
      title: "Coldplay Live: Music of the Spheres",
      startAt: "2026-10-10T18:30:00Z",
      venueName: "Olympiastadion",
      offer: { platform: "eventbrite", url: "https://eb.example.com/9", priceMin: 79, currency: "EUR" },
    };
    expect(isSameEvent(base, other)).toBe(true);
  });

  it("does not match different days", () => {
    expect(isSameEvent(base, { ...base, id: "x", startAt: "2026-10-11T18:00:00Z" })).toBe(false);
  });

  it("does not match different venues far apart", () => {
    expect(
      isSameEvent(base, { ...base, id: "x", latitude: 52.52, longitude: 13.405, venueName: "Olympiastadion Berlin" })
    ).toBe(false);
  });

  it("does not match unrelated titles at the same place and time", () => {
    expect(isSameEvent(base, { ...base, id: "x", title: "Bayern vs Dortmund" })).toBe(false);
  });
});

describe("mergeDuplicateEvents", () => {
  it("collapses duplicates into one item with every booking option, cheapest first", () => {
    const merged = mergeDuplicateEvents([
      base,
      {
        id: "eventbrite_9",
        title: "Coldplay Live: Music of the Spheres",
        description: "A much longer description of the evening with all the details.",
        startAt: "2026-10-10T18:30:00Z",
        venueName: "Olympiastadion",
        imageUrl: "https://img.example.com/eb.jpg",
        offer: { platform: "eventbrite", url: "https://eb.example.com/9", priceMin: 79, currency: "EUR" },
      },
      { ...base, id: "meetup_3", title: "Jazz night", offer: { platform: "meetup", url: "https://m.example.com/3", isFree: true } },
    ]);
    expect(merged).toHaveLength(2);
    const coldplay = merged.find((e) => e.id === "ticketmaster_1")!;
    expect(coldplay.offers.map((o) => o.platform)).toEqual(["eventbrite", "ticketmaster"]);
    expect(coldplay.images).toEqual(["https://img.example.com/tm.jpg", "https://img.example.com/eb.jpg"]);
    expect(coldplay.description).toContain("longer description");
    expect(coldplay.externalUrl).toBe("https://eb.example.com/9");
    expect(coldplay.externalPlatform).toBe("eventbrite");
  });

  it("ignores offers without an http(s) link and repeated ids", () => {
    const merged = mergeDuplicateEvents([
      { ...base, offer: { platform: "ticketmaster", url: "javascript:alert(1)" } },
      base,
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].offers).toEqual([]);
  });

  it("sorts the result by start time", () => {
    const merged = mergeDuplicateEvents([
      { ...base, id: "b", title: "Later show", startAt: "2026-10-12T18:00:00Z" },
      { ...base, id: "a", title: "Earlier show", startAt: "2026-10-09T18:00:00Z" },
    ]);
    expect(merged.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("sortOffers", () => {
  it("puts free first, then by price, unknown price last", () => {
    const sorted = sortOffers([
      { platform: "ticketmaster", url: "https://a", priceMin: 30 },
      { platform: "eventbrite", url: "https://b" },
      { platform: "meetup", url: "https://c", isFree: true },
      { platform: "getyourguide", url: "https://d", priceMin: 12 },
    ]);
    expect(sorted.map((o) => o.platform)).toEqual(["meetup", "getyourguide", "ticketmaster", "eventbrite"]);
  });
});

describe("inferVenueType", () => {
  it.each([
    [{ title: "Jazz im Park", category: "Music" }, "music"],
    [{ title: "Techno Party", venueName: "Blitz Club" }, "nightlife"],
    [{ title: "Guided walking tour of the old town", kind: "activity" as const }, "tour"],
    [{ title: "Pasta cooking class" }, "workshop"],
    [{ title: "Impressionism exhibition", venueName: "Neue Pinakothek" }, "museum"],
    [{ title: "Something unusual" }, "other"],
  ])("%o → %s", (input, expected) => {
    expect(inferVenueType(input)).toBe(expected);
  });
});

describe("rankForProfile", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  const events = mergeDuplicateEvents([
    { ...base, id: "far", title: "Opera gala", startAt: "2026-10-20T18:00:00Z", latitude: 48.4, longitude: 11.9 },
    { ...base, id: "jazz", title: "Jazz concert", startAt: "2026-10-10T19:00:00Z", latitude: 48.14, longitude: 11.58 },
  ]);

  it("puts interest + nearby + soon first and explains why", () => {
    const ranked = rankForProfile(events, { interests: ["Jazz"], latitude: 48.137, longitude: 11.575, nowMs: now });
    expect(ranked[0].id).toBe("jazz");
    expect(ranked[0].match).toEqual([
      { type: "interest", value: "Jazz" },
      { type: "distance", km: expect.any(Number) },
      { type: "soon" },
    ]);
    expect(ranked[1].match).toEqual([]);
  });

  it("keeps chronological order without a profile", () => {
    const ranked = rankForProfile(events, { nowMs: now });
    expect(ranked.map((e) => e.id)).toEqual(["jazz", "far"]);
  });
});
