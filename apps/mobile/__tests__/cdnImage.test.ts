import { buildStorageImageUrl, getOptimizedImageSource } from "@/lib/images/cdnImage";

const PUBLIC = "https://ref.supabase.co/storage/v1/object/public/user-photos/u1/romance/1.jpg";

describe("buildStorageImageUrl", () => {
  it("rewrites object URLs to the render endpoint with transform params", () => {
    const url = buildStorageImageUrl(PUBLIC, { width: 400, quality: 70, resize: "cover" });
    expect(url).toContain("/storage/v1/render/image/public/");
    expect(url).toContain("width=400");
    expect(url).toContain("quality=70");
    expect(url).toContain("resize=cover");
  });

  it("clamps quality to 1..100 and rounds dimensions", () => {
    const url = buildStorageImageUrl(PUBLIC, { width: 100.6, quality: 250 });
    expect(url).toContain("width=101");
    expect(url).toContain("quality=100");
  });

  it("returns the original URL when no dimensions are requested", () => {
    expect(buildStorageImageUrl(PUBLIC, {})).toBe(PUBLIC);
  });

  it("passes through non-storage URLs untouched", () => {
    const ext = "https://cdn.example.com/x.jpg";
    expect(buildStorageImageUrl(ext, { width: 100 })).toBe(ext);
    expect(buildStorageImageUrl("", { width: 100 })).toBe("");
  });
});

describe("getOptimizedImageSource", () => {
  it("returns undefined for empty input", () => {
    expect(getOptimizedImageSource(null)).toBeUndefined();
    expect(getOptimizedImageSource(undefined)).toBeUndefined();
  });

  it("wraps the optimized uri", () => {
    const src = getOptimizedImageSource(PUBLIC, { width: 200 });
    expect(src?.uri).toContain("width=200");
  });
});
