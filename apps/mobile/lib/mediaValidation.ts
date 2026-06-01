// ────────────────────────────────────────────────
// Winkly Media Validation
// Client-side size + MIME checks run BEFORE uploading to Supabase Storage,
// so we reject oversized / unsupported files without a wasted API round-trip.
//
// Limits mirror the backend:
//   - supabase/config.toml  → [storage] file_size_limit = "50MiB"
//   - supabase/migrations/20260613120000_storage_buckets_policies.sql
// ────────────────────────────────────────────────

import * as FileSystem from "expo-file-system/legacy";

/** Hard upload ceiling shared with Storage buckets: 50 MiB. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** Allowed image MIME types (profile photos, chat images, logos). */
export const ALLOWED_IMAGE_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** Allowed video MIME types. */
export const ALLOWED_VIDEO_MIME = ["video/mp4", "video/quicktime"] as const;

/** Allowed audio MIME types (voice notes / prompts → user-videos bucket). */
export const ALLOWED_AUDIO_MIME = [
  "audio/mp4",
  "audio/mpeg",
  "audio/aac",
  "audio/x-m4a",
] as const;

export type MediaKind = "image" | "video" | "audio";

export type MediaValidationResult = {
  ok: boolean;
  /** Human-readable reason when `ok` is false (safe to show in an Alert). */
  reason?: string;
  /** Resolved size in bytes when it could be determined. */
  bytes?: number;
};

function allowedMimeFor(kind: MediaKind): readonly string[] {
  switch (kind) {
    case "image":
      return ALLOWED_IMAGE_MIME;
    case "video":
      return ALLOWED_VIDEO_MIME;
    case "audio":
      return ALLOWED_AUDIO_MIME;
  }
}

function prettyBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Resolve a local file's size in bytes, preferring a value the picker already gave us. */
export async function getFileSizeBytes(
  uri: string,
  knownSize?: number | null
): Promise<number | null> {
  if (typeof knownSize === "number" && knownSize > 0) return knownSize;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof info.size === "number") return info.size;
  } catch {
    // size could not be determined locally — caller decides how strict to be
  }
  return null;
}

/**
 * Validate a media file before upload.
 * `mimeType` / `size` typically come straight off an expo-image-picker asset.
 * When `size` is missing we resolve it from the filesystem (no network call).
 */
export async function validateMediaForUpload(params: {
  uri: string;
  kind: MediaKind;
  mimeType?: string | null;
  size?: number | null;
}): Promise<MediaValidationResult> {
  const { uri, kind, mimeType, size } = params;
  const allowed = allowedMimeFor(kind);

  // MIME check (only when the picker reported a type; some platforms omit it).
  if (mimeType && !allowed.includes(mimeType.toLowerCase())) {
    return {
      ok: false,
      reason: `Unsupported file type (${mimeType}). Allowed: ${allowed
        .map((m) => m.split("/")[1])
        .join(", ")}.`,
    };
  }

  // Size check.
  const bytes = await getFileSizeBytes(uri, size);
  if (typeof bytes === "number" && bytes > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      bytes,
      reason: `File is too large (${prettyBytes(bytes)}). Maximum allowed is ${prettyBytes(
        MAX_UPLOAD_BYTES
      )}.`,
    };
  }

  return { ok: true, bytes: bytes ?? undefined };
}

/** Convenience wrapper for an expo-image-picker asset. */
export async function validatePickerAsset(
  asset: { uri: string; mimeType?: string | null; fileSize?: number | null },
  kind: MediaKind
): Promise<MediaValidationResult> {
  return validateMediaForUpload({
    uri: asset.uri,
    kind,
    mimeType: asset.mimeType ?? null,
    size: asset.fileSize ?? null,
  });
}
