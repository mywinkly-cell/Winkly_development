// apps/mobile/lib/moderation/mediaModeration.ts
//
// Client side of image moderation (docs/MODERATION.md). The server is the source of
// truth: the moderate-media Edge Function decides pass / review / block and the DB
// refuses unmoderated profile photos. This module only calls the function and turns
// verdicts into UI state.

import { supabase } from "@/lib/supabase";

export type ModerationStatus = "pass" | "review" | "block";

export const MEDIA_QUARANTINE_BUCKET = "media-quarantine";

export type ModerationResponse = { status: ModerationStatus; url?: string };

/**
 * Ask the server to moderate an uploaded object.
 * profile_photo: `path` is in media-quarantine; a "pass" returns the public `url`.
 * chat_image:    `path` is in chat-media.
 * Network / function failure resolves to "review" — never "pass" (fail closed).
 */
export async function requestModeration(
  kind: "profile_photo" | "chat_image",
  path: string
): Promise<ModerationResponse> {
  try {
    const { data, error } = await supabase.functions.invoke("moderate-media", { body: { kind, path } });
    if (error || !data) return { status: "review" };
    return parseModerationResponse(data);
  } catch {
    return { status: "review" };
  }
}

/** Validate a moderate-media response. Anything unexpected is treated as "review". */
export function parseModerationResponse(data: unknown): ModerationResponse {
  const d = data as { status?: unknown; url?: unknown } | null;
  const status = d?.status;
  if (status === "block") return { status: "block" };
  if (status === "pass") {
    // A profile "pass" without a URL can't be shown; the server still holds the photo.
    return typeof d?.url === "string" ? { status: "pass", url: d.url } : { status: "pass" };
  }
  return { status: "review" };
}

export type UploadModerationSummary = {
  /** Public URLs that passed and can go on the profile, in order. */
  urls: string[];
  /** Photos held for manual review (visible only to the uploader until approved). */
  held: number;
  /** Photos rejected by moderation. */
  blocked: number;
};

export function summarizeProfileUploads(
  results: ({ kind: "existing"; url: string } | { kind: "moderated"; res: ModerationResponse } | { kind: "failed" })[]
): UploadModerationSummary {
  const out: UploadModerationSummary = { urls: [], held: 0, blocked: 0 };
  for (const r of results) {
    if (r.kind === "existing") out.urls.push(r.url);
    else if (r.kind === "moderated") {
      if (r.res.status === "block") out.blocked += 1;
      else if (r.res.status === "pass" && r.res.url) out.urls.push(r.res.url);
      else out.held += 1;
    }
  }
  return out;
}

/**
 * How a chat image bubble renders.
 *   visible  → normal image
 *   blurred  → recipient sees a blurred placeholder + "Tap to view" (status review / unknown)
 *   removed  → "This photo was removed" (blocked / taken down)
 * The sender always sees their own image (with an "in review" hint when held).
 * Attachments without a storage path (GIFs, legacy public URLs) have no verdict and render as-is.
 */
export type ChatImageDisplay = "visible" | "blurred" | "removed";

export function chatImageDisplay(opts: {
  hasPath: boolean;
  moderation?: ModerationStatus;
  mine: boolean;
  revealed: boolean;
}): ChatImageDisplay {
  if (!opts.hasPath) return "visible";
  if (opts.moderation === "block") return "removed";
  if (opts.mine || opts.moderation === "pass") return "visible";
  // review, or not yet known → fail closed for the recipient.
  return opts.revealed ? "visible" : "blurred";
}
