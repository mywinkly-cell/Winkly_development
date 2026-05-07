// ChatsHeader — Used on every Chats screen (mode-selection, modes, standalone).
// Left: Add chat (chat + plus, 3D) | Center: Winkly | Right: Winkly AI (3D). Both buttons share same 3D style.

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Layout, Shadow, Typography, FontFamily, HEADER } from "@/constants/tokens";
import { WinklyAISpark } from "@/components/ui/WinklyAISpark";
import type { Mode } from "@/types";

type ChatsHeaderProps = {
  /** When true, show back button on the left instead of + (e.g. when chats is a stacked screen). */
  showBack?: boolean;
  mode?: Mode;
};

export function ChatsHeader({ showBack = false, mode }: ChatsHeaderProps) {
  const router = useRouter();

  const handleAddPress = () => {
    Haptics.selectionAsync();
    router.push("/chats/start");
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
            <Ionicons name="arrow-back" size={HEADER.iconSize} color={Colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.addChatButton3D}>
            <TouchableOpacity
              onPress={handleAddPress}
              style={styles.addChatInner}
              activeOpacity={0.8}
              accessibilityLabel="New conversation"
            >
              <Ionicons name="chatbubble-outline" size={HEADER.iconSize} color={Colors.primaryViolet} />
              <View style={styles.addChatPlusWrap}>
                <Ionicons name="add" size={HEADER.iconSize - 6} color={Colors.primaryViolet} />
              </View>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <View style={styles.centerTitleWrap}>
        <Text style={styles.centerTitle}>Winkly</Text>
      </View>
      <View style={styles.rightRow}>
        <View style={styles.aiButton3D}>
          <WinklyAISpark
            feature="concierge"
            onPress={handleAIPress}
            size={HEADER.iconSize}
            style={styles.sparkBtn}
            accessibilityLabel="Winkly AI"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    ...Layout.topHeaderBar,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    ...Shadow.card,
  },
  leftSlot: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    alignItems: "center",
    justifyContent: "center",
  },
  rightRow: {
    flexDirection: "row",
    alignItems: "center",
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    justifyContent: "flex-end",
  },
  addChatButton3D: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonSize / 2,
    backgroundColor: Colors.gray100,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  addChatInner: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonRadius,
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
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonRadius,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  aiButton3D: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonRadius,
    backgroundColor: Colors.gray100,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  sparkBtn: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    marginRight: 0,
  },
  centerTitleWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  centerTitle: {
    ...Typography.headerWinklyTitle,
    color: Colors.primaryViolet,
    fontFamily: FontFamily.headingBold,
    textAlign: "center",
  },
});
