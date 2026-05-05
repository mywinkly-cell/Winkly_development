/**
 * Winkly Chat System — TypeScript Types
 * Mode-aware, context-aware chat infrastructure
 */

export type AppMode = "romance" | "friends" | "business" | "events";

export type ConversationType = "dm" | "group" | "event" | "system" | "ai";

export type DMSource = "match" | "connection" | "invite" | "event";

export type MessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "gif"
  | "sticker"
  | "system"
  | "poll"
  | "location"
  | "cta";

export type MemberRole = "owner" | "admin" | "moderator" | "member";

export type ReportReason = "spam" | "harassment" | "inappropriate" | "fake" | "other";

/** UI-facing type (maps dm -> direct for display) */
export type ChatTypeDisplay = "direct" | "group" | "event" | "system";

export interface Conversation {
  id: string;
  type: ConversationType;
  mode: AppMode;
  created_by: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
  archived: boolean;
  name: string | null;
  related_event_id: string | null;
  related_group_id: string | null;
  is_system: boolean;
  system_type: string | null;
  expires_at: string | null;
  dm_source: DMSource | null;
  dm_initiator: string | null;
}

export interface ConversationMember {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  left_at: string | null;
  invited_by: string | null;
}

export interface ConversationMemberSettings {
  id: string;
  conversation_id: string;
  user_id: string;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  last_read_at: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: MessageType;
  attachments: MessageAttachment[];
  reply_to_id: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  delete_type: "none" | "for_me" | "for_everyone";
  status: string;
  created_at: string;
}

export interface MessageAttachment {
  type: "image" | "video" | "audio" | "file" | "gif";
  url: string;
  name?: string;
  size?: number;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface UserMini {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  main_photo_url?: string | null;
}

export interface ConversationWithMeta extends Conversation {
  participants: ConversationMember[];
  lastMessage: Message | null;
  memberSettings?: ConversationMemberSettings | null;
}

/** Convert DB type to display type */
export function toChatTypeDisplay(type: ConversationType): ChatTypeDisplay {
  if (type === "dm") return "direct";
  if (type === "group" || type === "event" || type === "system") return type;
  return "direct"; // ai falls back to direct
}
