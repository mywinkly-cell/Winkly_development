import { extractFirstUrl, parseSharedLink } from "@/lib/wishlist/sharedLink";

describe("extractFirstUrl", () => {
  it("finds the link inside shared text and trims punctuation", () => {
    expect(extractFirstUrl("Look at this place! https://www.instagram.com/reel/abc123/.")).toBe(
      "https://www.instagram.com/reel/abc123/"
    );
    expect(extractFirstUrl("no link here")).toBeNull();
  });
});

describe("parseSharedLink", () => {
  it("reads the place name and coordinates from a Google Maps link", () => {
    const r = parseSharedLink(
      "https://www.google.com/maps/place/Caf%C3%A9+Luitpold/@48.1447,11.5751,17z/data=!3m1"
    );
    expect(r).toMatchObject({ source: "google_maps", title: "Café Luitpold", latitude: 48.1447, longitude: 11.5751 });
  });

  it("recognises Instagram, TikTok and short Maps links", () => {
    expect(parseSharedLink("https://www.instagram.com/reel/xyz/")?.source).toBe("instagram");
    expect(parseSharedLink("https://vm.tiktok.com/ZM123/")?.source).toBe("tiktok");
    expect(parseSharedLink("https://maps.app.goo.gl/AbC123")?.source).toBe("google_maps");
  });

  it("reads Apple Maps names", () => {
    expect(parseSharedLink("https://maps.apple.com/?q=Tantris&ll=48.17,11.59")).toMatchObject({
      source: "apple_maps",
      title: "Tantris",
      latitude: 48.17,
      longitude: 11.59,
    });
  });

  it("returns null for text without a link", () => {
    expect(parseSharedLink("Tantris, Munich")).toBeNull();
  });
});
