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
  | "cta"
  | "icebreaker";

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
  /** Client-generated id used to reconcile optimistic bubbles with the persisted row. */
  client_id?: string | null;
  /** Optimistic-UI only: true while the message is awaiting the server INSERT. */
  pending?: boolean;
  /** Optimistic-UI only: true when the send failed and the user can retry. */
  failed?: boolean;
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

export interface MessageReadReceipt {
  message_id: string;
  user_id: string;
  read_at: string;
}

export interface MessageDeliveryReceipt {
  message_id: string;
  user_id: string;
  delivered_at: string;
}

/** Outgoing delivery status shown under the current user's own messages. */
export type OwnMessageStatus = "sent" | "delivered" | "seen";

export interface UserMini {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city: string | null;
  main_photo_url?: string | null;
  /** Mode-specific photos for avatar/profile consistency (chats/planner use conversation mode). */
  romance_photos?: (string | null)[];
  friends_photos?: (string | null)[];
  business_photos?: (string | null)[];
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
