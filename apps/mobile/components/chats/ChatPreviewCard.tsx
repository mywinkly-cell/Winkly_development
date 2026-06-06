/**
 * ChatPreviewCard — Displays conversation preview with:
 * Avatar(s) | Chat name | Last message | Timestamp | Unread count | Pinned badge
 */

import React from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography } from "@/constants/tokens";
import type { Conversation, Message } from "@/lib/chats/types";

type ChatPreviewCardProps = {
  conversation: Conversation;
  chatName: string;
  lastMessage: Message | null;
  participantAvatars: { userId: string; photoUrl?: string | null }[];
  timestamp: string;
  unreadCount: number;
  isPinned: boolean;
  onPress: () => void;
  /** When set and this is a 1:1 chat, tapping the avatar opens this user's profile. */
  onAvatarPress?: (userId: string) => void;
  /** Romance pre-match invite awaiting accept/decline. */
  isPendingRomanceInvite?: boolean;
};

function getLastMessagePreview(msg: Message | null): string {
  if (!msg) return "No messages yet";
  if (msg.delete_type === "for_everyone") return "Message deleted";
  if (msg.message_type === "image" || msg.message_type === "gif") return "📷 Photo";
  if (msg.message_type === "audio") return "🎤 Voice message";
  if (msg.content?.trim()) return msg.content.trim();
  return "Message";
}

export function ChatPreviewCard({
  conversation,
  chatName,
  lastMessage,
  participantAvatars,
  timestamp,
  unreadCount,
  isPinned,
  onPress,
  onAvatarPress,
  isPendingRomanceInvite = false,
}: ChatPreviewCardProps) {
  const hasUnread = unreadCount > 0;
  const isDm = conversation.type === "dm";
  const canOpenProfile = isDm && participantAvatars.length === 1 && onAvatarPress;

  const avatarContent = participantAvatars.length === 1 ? (
    <View style={styles.avatarWrap}>
      {participantAvatars[0].photoUrl ? (
        <Image
          source={{ uri: participantAvatars[0].photoUrl }}
          style={styles.avatar}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.avatar, styles.avatarPlaceholder]}>
          <Ionicons name="person" size={24} color={Colors.gray500} />
        </View>
      )}
    </View>
  ) : participantAvatars.length > 1 ? (
          <View style={styles.avatarStack}>
            {participantAvatars.slice(0, 2).map((a, i) => (
              <View
                key={a.userId}
                style={[
                  styles.avatarWrap,
                  styles.avatarStacked,
                  { marginLeft: i === 1 ? -16 : 0, zIndex: 2 - i },
                ]}
              >
                {a.photoUrl ? (
                  <Image source={{ uri: a.photoUrl }} style={styles.avatarStackedImg} resizeMode="cover" />
                ) : (
                  <View style={[styles.avatarStackedImg, styles.avatarPlaceholder]}>
                    <Ionicons name="person" size={18} color={Colors.gray500} />
                  </View>
                )}
              </View>
            ))}
          </View>
  ) : (
    <View style={[styles.avatarWrap, styles.avatarPlaceholder]}>
      <Ionicons name="chatbubbles" size={24} color={Colors.gray500} />
    </View>
  );

  return (
    <Pressable onPress={onPress} style={styles.card} android_ripple={{ color: Colors.gray200 }}>
      {/* Avatar(s) — tappable in 1:1 to open other user's profile */}
      <View style={styles.avatarSection}>
        {canOpenProfile ? (
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              onAvatarPress(participantAvatars[0].userId);
            }}
            style={styles.avatarWrap}
          >
            {avatarContent}
          </Pressable>
        ) : (
          avatarContent
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.chatNameRow}>
            <Text style={[styles.chatName, hasUnread && styles.chatNameUnread]} numberOfLines={1}>
              {chatName}
            </Text>
            {isPendingRomanceInvite && (
              <View style={styles.inviteBadge}>
                <Ionicons name="mail" size={11} color={Colors.romance.primary} />
                <Text style={styles.inviteBadgeText}>Invite</Text>
              </View>
            )}
            {conversation.type === "event" && (
              <View style={styles.eventBadge}>
                <Text style={styles.eventBadgeText}>Event</Text>
              </View>
            )}
          </View>
          <View style={styles.rightMeta}>
            {isPinned && (
              <Ionicons name="pin" size={12} color={Colors.gray500} style={styles.pinnedBadge} />
            )}
            <Text style={[styles.timestamp, hasUnread && styles.timestampUnread]}>{timestamp}</Text>
          </View>
        </View>
        <View style={styles.subtitleRow}>
          <Text
            style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]}
            numberOfLines={1}
          >
            {getLastMessagePreview(lastMessage)}
          </Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadCount}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  avatarSection: {
    marginRight: 12,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: Colors.gray100,
  },
  avatar: {
    width: 52,
    height: 52,
  },
  avatarPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarStack: {
    flexDirection: "row",
    width: 52,
    height: 52,
  },
  avatarStacked: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarStackedImg: {
    width: 36,
    height: 36,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  chatNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  chatName: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  inviteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.romance.primary + "18",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  inviteBadgeText: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: "700",
    color: Colors.romance.primary,
  },
  eventBadge: {
    backgroundColor: Colors.events.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  eventBadgeText: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: "700",
    color: Colors.events.primary,
  },
  chatNameUnread: {
    fontWeight: "700",
  },
  rightMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pinnedBadge: {
    marginRight: 2,
  },
  timestamp: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.gray500,
  },
  timestampUnread: {
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  lastMessage: {
    flex: 1,
    fontSize: 14,
    color: Colors.gray600,
  },
  lastMessageUnread: {
    color: Colors.textPrimary,
    fontWeight: "500",
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primaryViolet,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  unreadCount: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.white,
  },
});
