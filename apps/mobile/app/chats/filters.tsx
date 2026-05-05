// Chats filters — Filter conversations by mode, unread, etc.
// Reached from Chats header filter icon (no longer opens planner).

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Layout, Typography, HEADER } from "@/constants/tokens";

export default function ChatsFilters() {
  const router = useRouter();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            router.back();
          }}
          style={styles.backBtn}
          activeOpacity={0.9}
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={HEADER.iconSize} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chat filters</Text>
        <View style={styles.headerRight} />
      </View>
      <View style={styles.content}>
        <Text style={styles.placeholder}>
          Filter by mode, unread, or pinned. More options coming soon.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    ...Layout.topHeaderBar,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  backBtn: { width: HEADER.buttonSize, height: HEADER.buttonSize, borderRadius: HEADER.buttonRadius, alignItems: "center", justifyContent: "center" },
  headerTitle: {
    ...Typography.headerTitle,
    color: Colors.primaryViolet,
  },
  headerRight: { width: HEADER.buttonSize, height: HEADER.buttonSize },
  content: {
    flex: 1,
    padding: 20,
  },
  placeholder: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
});
