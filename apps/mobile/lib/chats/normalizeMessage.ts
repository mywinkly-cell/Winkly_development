import type { Message, MessageType } from "./types";

/** Normalize Supabase realtime / insert payload into a Message (defaults match DB). */
export function normalizeMessageRow(row: Record<string, unknown> | Message): Message {
  const r = row as Record<string, unknown>;
  const dt = r.delete_type as string | null | undefined;
  const mt = (r.message_type as MessageType | null | undefined) ?? "text";
  const attachments = Array.isArray(r.attachments) ? (r.attachments as Message["attachments"]) : [];
  return {
    id: String(r.id),
    conversation_id: String(r.conversation_id),
    sender_id: String(r.sender_id),
    content: typeof r.content === "string" ? r.content : "",
    message_type: mt,
    attachments,
    reply_to_id: r.reply_to_id != null ? String(r.reply_to_id) : null,
    edited_at: r.edited_at != null ? String(r.edited_at) : null,
    deleted_at: r.deleted_at != null ? String(r.deleted_at) : null,
    delete_type:
      dt === "for_me" || dt === "for_everyone" ? dt : ("none" as Message["delete_type"]),
    status: typeof r.status === "string" ? r.status : "sent",
    created_at: String(r.created_at),
    client_id: r.client_id != null ? String(r.client_id) : null,
  };
}
