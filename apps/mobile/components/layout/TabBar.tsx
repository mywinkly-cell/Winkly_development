// apps/mobile/components/layout/TabBar.tsx
// Reusable horizontal tab bar (used across Chats/Planner screens).

import React, { useMemo } from "react";
import { ScrollView, Pressable, Text, ViewStyle, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { Colors, Typography } from "@/constants/tokens";

export type TabBarItem<Key extends string = string> = {
  key: Key;
  label: string;
};

export type TabBarProps<Key extends string = string> = {
  tabs: TabBarItem<Key>[];
  activeKey: Key;
  onChange: (key: Key) => void;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
};

export function TabBar<Key extends string = string>({
  tabs,
  activeKey,
  onChange,
  style,
  contentContainerStyle,
}: TabBarProps<Key>) {
  const keySet = useMemo(() => new Set(tabs.map((t) => t.key)), [tabs]);

  const safeActiveKey = keySet.has(activeKey) ? activeKey : tabs[0]?.key;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.scroll, style]}
      contentContainerStyle={[styles.content, contentContainerStyle]}
    >
      {tabs.map((t) => {
        const active = t.key === safeActiveKey;
        return (
          <Pressable
            key={t.key}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(t.key);
            }}
            style={[styles.tab, active && styles.tabActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 52 },
  content: { flexDirection: "row", paddingHorizontal: 16, gap: 10, alignItems: "center" },
  tab: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.white,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  tabActive: {
    backgroundColor: Colors.primaryViolet,
    borderColor: Colors.primaryViolet,
  },
  tabText: { ...Typography.caption, color: Colors.gray700 },
  tabTextActive: { color: Colors.accentYellow, fontWeight: "700" as const },
});

