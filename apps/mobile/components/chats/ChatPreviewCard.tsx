/**
 * ChatPreviewCard — Displays conversation preview with:
 * Avatar(s) | Chat name | Last message | Timestamp | Unread count | Pinned badge
 * Mixed inbox (All tab): mode color on left accent bar only; neutral avatar, pill, and unread badge.
 */

import React from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography } from "@/constants/tokens";
import { getChatModeDisplay } from "@/lib/chats/modeDisplay";
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
  /** Show mode badge + accent. */
  showModeContext?: boolean;
  /** When true (All tab mixed inbox), mode color only on left accent — avatar/pill/badge stay neutral. */
  mutedModeContext?: boolean;
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
  showModeContext = false,
  mutedModeContext = false,
}: ChatPreviewCardProps) {
  const hasUnread = unreadCount > 0;
  const isDm = conversation.type === "dm";
  const canOpenProfile = isDm && participantAvatars.length === 1 && onAvatarPress;
  const modeDisplay =
    showModeContext && conversation.type !== "event"
      ? getChatModeDisplay(conversation.mode)
      : null;
  // All-tab mixed inbox: mode color only on the left accent bar; everything else neutral.
  const mutedMixedInbox = Boolean(modeDisplay && mutedModeContext);
  const unreadBadgeColor = mutedMixedInbox ? Colors.gray600 : (modeDisplay?.primary ?? Colors.primaryViolet);

  const avatarRingStyle = mutedMixedInbox
    ? undefined
    : modeDisplay
      ? { borderWidth: 2, borderColor: modeDisplay.primary }
      : isPendingRomanceInvite
        ? { borderWidth: 2, borderColor: Colors.romance.primary, borderStyle: "dashed" as const }
        : undefined;

  const avatarDecorations = (
    <>
      {modeDisplay && !mutedMixedInbox && (
        <View
          style={[styles.modeDot, { backgroundColor: modeDisplay.primary }]}
          accessibilityLabel={`${modeDisplay.label} chat`}
        />
      )}
      {isPendingRomanceInvite && (
        <View style={styles.inviteAvatarBadge} accessibilityLabel="Chat invite">
          <Ionicons name="mail-unread" size={12} color={Colors.white} />
        </View>
      )}
    </>
  );

  const avatarContent = participantAvatars.length === 1 ? (
    <View style={[styles.avatarWrap, avatarRingStyle]}>
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
      {avatarDecorations}
    </View>
  ) : participantAvatars.length > 1 ? (
    <View style={styles.avatarStack}>
      {participantAvatars.slice(0, 2).map((a, i) => (
        <View
          key={a.userId}
          style={[
            styles.avatarWrap,
            styles.avatarStacked,
            i === 0 && avatarRingStyle,
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
          {i === 0 && avatarDecorations}
        </View>
      ))}
    </View>
  ) : (
    <View style={[styles.avatarWrap, styles.avatarPlaceholder, avatarRingStyle]}>
      <Ionicons name="chatbubbles" size={24} color={Colors.gray500} />
      {avatarDecorations}
    </View>
  );

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.card,
        modeDisplay && {
          borderLeftWidth: 3,
          borderLeftColor: modeDisplay.primary,
          paddingLeft: 12,
        },
        isPendingRomanceInvite && !modeDisplay && {
          borderLeftWidth: 4,
          borderLeftColor: Colors.romance.primary,
          paddingLeft: 11,
        },
      ]}
      android_ripple={{ color: Colors.gray200 }}
    >
      <View style={styles.avatarSection}>
        {canOpenProfile ? (
          <Pressable
            onPress={(e) => {
              e?.stopPropagation?.();
              onAvatarPress(participantAvatars[0].userId);
            }}
            style={styles.avatarTapTarget}
          >
            {avatarContent}
          </Pressable>
        ) : (
          avatarContent
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.titleBlock}>
            <Text style={[styles.chatName, hasUnread && styles.chatNameUnread]} numberOfLines={1}>
              {chatName}
            </Text>
            {(modeDisplay || isPendingRomanceInvite || conversation.type === "event") && (
              <View style={styles.badgeRow}>
                {modeDisplay && (
                  <View
                    style={[
                      styles.modeBadge,
                      mutedMixedInbox
                        ? styles.modeBadgeMuted
                        : { backgroundColor: modeDisplay.secondary },
                    ]}
                  >
                    {!mutedMixedInbox && (
                      <View style={[styles.modeBadgeDot, { backgroundColor: modeDisplay.primary }]} />
                    )}
                    <Text
                      style={[
                        styles.modeBadgeText,
                        mutedMixedInbox
                          ? styles.modeBadgeTextMuted
                          : { color: modeDisplay.primary },
                      ]}
                    >
                      {modeDisplay.label}
                    </Text>
                  </View>
                )}
                {isPendingRomanceInvite && (
                  <View style={styles.inviteBadge}>
                    <Ionicons name="mail-unread" size={11} color={Colors.romance.primary} />
                    <Text style={styles.inviteBadgeText}>Invite</Text>
                  </View>
                )}
                {conversation.type === "event" && (
                  <View style={styles.eventBadge}>
                    <Text style={styles.eventBadgeText}>Event</Text>
                  </View>
                )}
              </View>
            )}
          </View>
          <View style={styles.rightMeta}>
            {hasUnread && (
              <View style={[styles.unreadBadge, { backgroundColor: unreadBadgeColor }]}>
                <Text style={styles.unreadCount}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
              </View>
            )}
            {isPinned && (
              <Ionicons name="pin" size={12} color={Colors.gray500} style={styles.pinnedBadge} />
            )}
            <Text style={[styles.timestamp, hasUnread && styles.timestampUnread]} numberOfLines={1}>
              {timestamp}
            </Text>
          </View>
        </View>
        <Text
          style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]}
          numberOfLines={1}
        >
          {isPendingRomanceInvite ? "Sent you a chat invite" : getLastMessagePreview(lastMessage)}
        </Text>
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
    flexShrink: 0,
  },
  avatarTapTarget: {
    alignSelf: "flex-start",
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "visible",
    backgroundColor: Colors.gray100,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
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
    overflow: "visible",
  },
  avatarStackedImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
  },
  modeDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.white,
    zIndex: 3,
  },
  inviteAvatarBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.romance.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.white,
    zIndex: 4,
    shadowColor: Colors.romance.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 3,
    elevation: 3,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: 8,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  chatName: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  modeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexShrink: 0,
  },
  modeBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  modeBadgeText: {
    ...Typography.caption,
    fontSize: 10,
    fontWeight: "700",
  },
  modeBadgeMuted: {
    backgroundColor: Colors.gray100,
  },
  modeBadgeTextMuted: {
    color: Colors.gray700,
    fontWeight: "600",
  },
  inviteBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: Colors.romance.primary + "22",
    borderWidth: 1,
    borderColor: Colors.romance.primary + "55",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexShrink: 0,
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
    flexShrink: 0,
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
    flexShrink: 0,
    maxWidth: "42%",
  },
  pinnedBadge: {
    marginRight: 0,
  },
  timestamp: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.gray500,
    flexShrink: 0,
  },
  timestampUnread: {
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  lastMessage: {
    fontSize: 14,
    color: Colors.gray600,
  },
  lastMessageUnread: {
    color: Colors.textPrimary,
    fontWeight: "500",
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.primaryViolet,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
    flexShrink: 0,
  },
  unreadCount: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.white,
  },
});

