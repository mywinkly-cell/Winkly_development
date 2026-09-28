// apps/mobile/lib/wishlist/sharedLink.ts
// Saving a place from a link — the "I saw a reel about a nice place" moment. Pure parsing
// (no network): recognise where the link comes from and pull out whatever the URL itself
// tells us (Google Maps puts the place name and coordinates in the path).

export type LinkSource = "instagram" | "tiktok" | "google_maps" | "apple_maps" | "youtube" | "web";

export type ParsedLink = {
  url: string;
  source: LinkSource;
  /** Place name when the URL contains one (Google Maps /place/<name>/, Apple Maps ?q=). */
  title?: string;
  latitude?: number;
  longitude?: number;
};

/** First http(s) URL in a piece of shared text ("Look at this! https://…"). */
export function extractFirstUrl(text: string | null | undefined): string | null {
  const m = (text ?? "").match(/https?:\/\/[^\s<>"')]+/i);
  return m ? m[0].replace(/[.,;!?]+$/, "") : null;
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\./, "");
}

function decodePlaceSegment(seg: string): string {
  try {
    return decodeURIComponent(seg.replace(/\+/g, " ")).trim();
  } catch {
    return seg.replace(/\+/g, " ").trim();
  }
}

export function parseSharedLink(input: string | null | undefined): ParsedLink | null {
  const raw = extractFirstUrl(input);
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = hostOf(url);
  const out: ParsedLink = { url: raw, source: "web" };

  if (host === "instagram.com" || host.endsWith(".instagram.com")) out.source = "instagram";
  else if (host === "tiktok.com" || host.endsWith(".tiktok.com")) out.source = "tiktok";
  else if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) out.source = "youtube";
  else if (host === "maps.apple.com") {
    out.source = "apple_maps";
    const q = url.searchParams.get("q");
    if (q) out.title = q.trim();
    const ll = url.searchParams.get("ll")?.split(",").map(Number);
    if (ll && ll.length === 2 && ll.every(Number.isFinite)) [out.latitude, out.longitude] = ll;
  } else if (
    host === "maps.app.goo.gl" ||
    host === "goo.gl" ||
    host.startsWith("maps.google.") ||
    (host.startsWith("google.") && url.pathname.startsWith("/maps"))
  ) {
    out.source = "google_maps";
    const place = url.pathname.match(/\/maps\/place\/([^/]+)/);
    if (place) out.title = decodePlaceSegment(place[1]);
    const q = url.searchParams.get("q") ?? url.searchParams.get("query");
    if (!out.title && q && !/^-?\d/.test(q)) out.title = q.trim();
    const at = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (at) {
      out.latitude = Number(at[1]);
      out.longitude = Number(at[2]);
    }
  }
  if (out.title) out.title = out.title.slice(0, 120);
  return out;
}
