// apps/mobile/lib/chats/chatMedia.ts
//
// Signed-URL resolution for private chat media.
//
// Chat images and voice notes live in the PRIVATE `chat-media` bucket (see
// supabase/migrations/20260628120000_chat_media_private_bucket.sql). They are
// referenced on messages by a durable storage `path`; there is no public URL.
// To display them we mint short-lived signed URLs, which Supabase only issues to
// callers who pass the bucket's RLS (i.e. active members of the conversation).
//
// Signing happens in the data layer (lib/chats/hooks.ts) on fetch + realtime, so
// the render layer keeps reading `attachment.url` unchanged. The same pass also
// attaches each image's moderation verdict (docs/MODERATION.md).

import { supabase } from "@/lib/supabase";
import type { ModerationStatus } from "@/lib/moderation/mediaModeration";
import type { Message } from "./types";

export const CHAT_MEDIA_BUCKET = "chat-media";

// Signed URLs are re-minted on every fetch / realtime event and on pagination,
// so a few hours comfortably covers a viewing session while keeping any leaked
// URL short-lived.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 4;

/** Mint a signed URL for one chat-media path (used right after upload for optimistic display). */
export async function signChatMediaPath(path: string): Promise<string> {
  try {
    const { data } = await supabase.storage
      .from(CHAT_MEDIA_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    return data?.signedUrl ?? "";
  } catch {
    return "";
  }
}

async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  try {
    const { data, error } = await supabase.storage
      .from(CHAT_MEDIA_BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    if (!error && data) {
      for (const row of data) {
        if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
      }
    }
  } catch {
    // Network/permission failure → leave urls as-is rather than blocking the chat.
  }
  return signed;
}

/** Server-side verdicts for chat images (members only, see get_chat_media_moderation). */
async function fetchVerdicts(paths: string[]): Promise<Map<string, ModerationStatus>> {
  const verdicts = new Map<string, ModerationStatus>();
  try {
    const { data, error } = await supabase.rpc("get_chat_media_moderation", { p_paths: paths });
    if (!error && Array.isArray(data)) {
      for (const row of data as { path: string; status: string }[]) {
        if (row.status === "pass" || row.status === "review" || row.status === "block") {
          verdicts.set(row.path, row.status);
        }
      }
    }
  } catch {
    // Unknown verdict → undefined → the recipient sees the image blurred.
  }
  return verdicts;
}

/**
 * Resolve private chat-media storage paths to short-lived signed URLs and attach
 * each attachment's server-side moderation verdict.
 *
 * Returns copies of the affected messages with `attachment.url` populated from
 * the signed URL. Attachments without a `path` (GIFs, external/legacy URLs,
 * optimistic local uris) are left untouched. A no-op (no network) for text-only
 * messages, so it is cheap to call on every fetch and realtime event.
 *
 * Fail closed: a `moderation` value persisted on the message by the sender is
 * discarded; if the verdict lookup fails it stays undefined (treated as "review").
 */
export async function hydrateChatMediaUrls(messages: Message[]): Promise<Message[]> {
  const paths = new Set<string>();
  for (const m of messages) {
    for (const a of m.attachments ?? []) {
      if (a?.path) paths.add(a.path);
    }
  }
  if (paths.size === 0) return messages;

  const list = Array.from(paths);
  const [signed, verdicts] = await Promise.all([signPaths(list), fetchVerdicts(list)]);

  return messages.map((m) => {
    if (!m.attachments?.some((a) => a?.path)) return m;
    return {
      ...m,
      attachments: m.attachments.map((a) => {
        if (!a?.path) return a;
        const { moderation: _untrusted, ...rest } = a;
        const url = signed.get(a.path) ?? a.url;
        const verdict = verdicts.get(a.path);
        return verdict ? { ...rest, url, moderation: verdict } : { ...rest, url };
      }),
    };
  });
}
