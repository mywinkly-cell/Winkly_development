// apps/mobile/lib/images/cdnImage.ts
// Helpers for serving profile/match media through the Supabase Storage CDN with
// on-the-fly image transformation (Supabase Pro). Smaller, format-optimized
// renditions dramatically cut image bytes + load time for far-from-region users.
//
// Public object URL:  .../storage/v1/object/public/<bucket>/<path>
// Render (CDN) URL:    .../storage/v1/render/image/public/<bucket>/<path>?width=..&quality=..
//
// Uploads should set CACHE_CONTROL_IMMUTABLE so the CDN/edge can cache for a
// long time — our upload paths embed a timestamp, so each URL is immutable.

/** 1 year. Safe because uploaded filenames are unique (timestamped) and never overwritten. */
export const CACHE_CONTROL_IMMUTABLE = "31536000";

export type ImageTransform = {
  width?: number;
  height?: number;
  /** 1–100. Lower = smaller bytes. Defaults to a sensible 75 when omitted. */
  quality?: number;
  resize?: "cover" | "contain" | "fill";
};

const OBJECT_PUBLIC = "/storage/v1/object/public/";
const RENDER_PUBLIC = "/storage/v1/render/image/public/";

/**
 * Convert a Supabase public object URL into a transformed CDN render URL.
 * Returns the input unchanged when it isn't a recognizable public object URL
 * or when no transform is requested (so callers can always route through this).
 */
export function buildStorageImageUrl(publicUrl: string, transform: ImageTransform = {}): string {
  if (!publicUrl || !publicUrl.includes(OBJECT_PUBLIC)) return publicUrl;

  const params: string[] = [];
  if (transform.width) params.push(`width=${Math.round(transform.width)}`);
  if (transform.height) params.push(`height=${Math.round(transform.height)}`);
  const quality = transform.quality ?? 75;
  params.push(`quality=${Math.max(1, Math.min(100, Math.round(quality)))}`);
  if (transform.resize) params.push(`resize=${transform.resize}`);

  // No dimensions requested → not worth the render endpoint; keep original.
  if (!transform.width && !transform.height) return publicUrl;

  const rendered = publicUrl.replace(OBJECT_PUBLIC, RENDER_PUBLIC);
  const sep = rendered.includes("?") ? "&" : "?";
  return `${rendered}${sep}${params.join("&")}`;
}

/** Convenience for <Image source>: an optimized URI for the requested display size. */
export function getOptimizedImageSource(
  publicUrl: string | null | undefined,
  transform: ImageTransform = {}
): { uri: string } | undefined {
  if (!publicUrl) return undefined;
  return { uri: buildStorageImageUrl(publicUrl, transform) };
}
