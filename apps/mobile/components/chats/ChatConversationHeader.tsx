/**
 * Tappable chat title: avatar/icon + name for 1:1 and group threads.
 */

import React from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "@/components/ui/Avatar";
import { Colors } from "@/constants/tokens";

type ParticipantAvatar = {
  uri?: string | null;
  initials: string;
};

type ChatConversationHeaderProps = {
  isGroup: boolean;
  displayName: string;
  subtitle: string;
  peerAvatarUri?: string | null;
  peerInitials?: string;
  groupAvatarUri?: string | null;
  participantAvatars?: ParticipantAvatar[];
  onPress: () => void;
  accessibilityLabel?: string;
};

function GroupAvatarStack({
  groupAvatarUri,
  participantAvatars,
  displayName,
}: {
  groupAvatarUri?: string | null;
  participantAvatars: ParticipantAvatar[];
  displayName: string;
}) {
  if (groupAvatarUri) {
    return <Avatar uri={groupAvatarUri} initials={displayName.slice(0, 2)} size={40} />;
  }

  if (participantAvatars.length >= 2) {
    return (
      <View style={styles.avatarStack}>
        {participantAvatars.slice(0, 2).map((entry, index) => (
          <View
            key={`${entry.initials}-${index}`}
            style={[styles.stackedAvatarWrap, index > 0 ? styles.stackedAvatarOverlap : null]}
          >
            {entry.uri ? (
              <Image source={{ uri: entry.uri }} style={styles.stackedAvatar} resizeMode="cover" />
            ) : (
              <View style={[styles.stackedAvatar, styles.stackedPlaceholder]}>
                <Text style={styles.stackedInitials}>{entry.initials.slice(0, 2)}</Text>
              </View>
            )}
          </View>
        ))}
      </View>
    );
  }

  if (participantAvatars.length === 1) {
    const entry = participantAvatars[0];
    return <Avatar uri={entry.uri} initials={entry.initials} size={40} />;
  }

  return (
    <View style={styles.groupIconWrap}>
      <Ionicons name="people" size={22} color={Colors.primaryViolet} />
    </View>
  );
}

export function ChatConversationHeader({
  isGroup,
  displayName,
  subtitle,
  peerAvatarUri,
  peerInitials = "?",
  groupAvatarUri,
  participantAvatars = [],
  onPress,
  accessibilityLabel,
}: ChatConversationHeaderProps) {
  return (
    <Pressable
      style={styles.container}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${displayName} details`}
    >
      {isGroup ? (
        <GroupAvatarStack
          groupAvatarUri={groupAvatarUri}
          participantAvatars={participantAvatars}
          displayName={displayName}
        />
      ) : (
        <Avatar uri={peerAvatarUri} initials={peerInitials} size={40} />
      )}

      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {displayName}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={Colors.gray500} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 2,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontWeight: "900",
    fontSize: 16,
    color: Colors.textPrimary,
  },
  subtitle: {
    opacity: 0.65,
    fontSize: 12,
    color: Colors.textPrimary,
    marginTop: 1,
  },
  groupIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primaryViolet + "18",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarStack: {
    width: 44,
    height: 40,
    position: "relative",
  },
  stackedAvatarWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.backgroundLight,
  },
  stackedAvatarOverlap: {
    left: 16,
    top: 12,
  },
  stackedAvatar: {
    width: "100%",
    height: "100%",
  },
  stackedPlaceholder: {
    backgroundColor: Colors.gray200,
    alignItems: "center",
    justifyContent: "center",
  },
  stackedInitials: {
    fontSize: 10,
    fontWeight: "700",
    color: Colors.gray600,
  },
});
