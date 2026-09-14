// ChatsHeader — Used on every Chats screen (mode-selection, modes, standalone).
// Left: Add chat (chat + plus, 3D) | Center: Winkly | Right: Winkly AI (3D). Both buttons share same 3D style.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { appModeToHub, chatRoutes, getModeHubFromPathname } from "@/lib/navigation/modeHub";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { WinklyAISpark } from "@/components/ui/WinklyAISpark";
import type { Mode } from "@/types";

type ChatsHeaderProps = {
  /** When true, show back button on the left instead of + (e.g. when chats is a stacked screen). */
  showBack?: boolean;
  mode?: Mode;
};

const BUTTON_SIZE = 44;
const ICON_SIZE = 24;

export function ChatsHeader({ showBack = false, mode }: ChatsHeaderProps) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const chatHub = getModeHubFromPathname(pathname);
  const hub = chatHub !== "tabs" ? chatHub : appModeToHub(mode ?? null);

  const handleAddPress = () => {
    Haptics.selectionAsync();
    if (hub === "romance") {
      router.push(chatRoutes.newChat(hub, "romance"));
      return;
    }
    router.push(chatRoutes.start(hub));
  };

  const handleAIPress = () => {
    Haptics.selectionAsync();
    router.push({
      pathname: "/concierge",
      params: {
        source_screen: "chats",
        ...(mode ? { mode } : {}),
      },
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.leftSlot}>
        {showBack ? (
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              router.back();
            }}
            style={styles.iconBtn}
            activeOpacity={0.8}
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={ICON_SIZE} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.button3D}>
            <TouchableOpacity
              onPress={handleAddPress}
              style={styles.addChatInner}
              activeOpacity={0.8}
              accessibilityLabel="New conversation"
            >
              <Ionicons name="chatbubble-outline" size={ICON_SIZE} color={theme.colors.primary} />
              <View style={styles.addChatPlusWrap}>
                <Ionicons name="add" size={ICON_SIZE - 6} color={theme.colors.primary} />
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={styles.centerTitleWrap}>
        <Text style={styles.centerTitle}>Winkly</Text>
      </View>
      <View style={styles.rightRow}>
        <View style={styles.button3D}>
          <WinklyAISpark
            feature="concierge"
            onPress={handleAIPress}
            size={ICON_SIZE}
            style={styles.sparkBtn}
            accessibilityLabel="Winkly AI"
          />
        </View>
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    container: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.md,
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      ...theme.elevation(1),
    },
    leftSlot: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      alignItems: "center",
      justifyContent: "center",
    },
    rightRow: {
      flexDirection: "row",
      alignItems: "center",
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      justifyContent: "flex-end",
    },
    button3D: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
      ...theme.elevation(2),
    },
    addChatInner: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      borderRadius: theme.radii.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    addChatPlusWrap: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    iconBtn: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
      ...theme.elevation(1),
    },
    sparkBtn: {
      width: BUTTON_SIZE,
      height: BUTTON_SIZE,
      marginRight: 0,
    },
    centerTitleWrap: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    centerTitle: {
      ...theme.type.h2,
      fontFamily: theme.type.h2.fontFamily,
      color: theme.colors.primary,
      textAlign: "center",
    },
  });
}
