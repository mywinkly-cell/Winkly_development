import React from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography } from "@/constants/tokens";
import type { ChatTabConfig, ChatTabKey } from "@/lib/chats/chatTabs";

const EVENTS_ICON = require("@/assets/icons/events-icon_1.png");

type ChatModeTabBarProps = {
  tabs: ChatTabConfig[];
  activeTab: ChatTabKey;
  onTabPress: (tab: ChatTabKey) => void;
};

export function ChatModeTabBar({ tabs, activeTab, onTabPress }: ChatModeTabBarProps) {
  return (
    <View style={styles.tabBar}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabBarContent}
        style={styles.tabBarScroll}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const isAll = tab.key === "all";

          let backgroundColor = Colors.white;
          let labelColor = Colors.gray600;
          let iconColor = tab.accent;

          if (isActive) {
            if (isAll) {
              backgroundColor = Colors.primaryViolet;
              labelColor = Colors.white;
              iconColor = Colors.white;
            } else {
              backgroundColor = tab.secondary;
              labelColor = tab.accent;
              iconColor = tab.accent;
            }
          }

          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onTabPress(tab.key)}
              style={[styles.tab, { backgroundColor }]}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              {!isAll && tab.useEventsImage ? (
                <Image
                  source={EVENTS_ICON}
                  style={[styles.eventsIcon, { tintColor: iconColor }]}
                  resizeMode="contain"
                />
              ) : !isAll && tab.icon ? (
                <Ionicons name={tab.icon} size={16} color={iconColor} />
              ) : null}
              <Text
                style={[
                  styles.tabLabel,
                  { color: labelColor, fontWeight: isActive ? "700" : "500" },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.white,
    minHeight: 48,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  tabBarScroll: { flex: 1 },
  tabBarContent: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    paddingHorizontal: 16,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    minHeight: 36,
  },
  tabLabel: {
    ...Typography.caption,
    fontSize: 13,
  },
  eventsIcon: {
    width: 16,
    height: 16,
  },
});
