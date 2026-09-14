import React from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import type { ChatTabConfig, ChatTabKey } from "@/lib/chats/chatTabs";

const EVENTS_ICON = require("@/assets/icons/events-icon_1.png");

type ChatModeTabBarProps = {
  tabs: ChatTabConfig[];
  activeTab: ChatTabKey;
  onTabPress: (tab: ChatTabKey) => void;
};

export function ChatModeTabBar({ tabs, activeTab, onTabPress }: ChatModeTabBarProps) {
  const theme = useAppTheme();
  const styles = createStyles(theme);

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

          let backgroundColor = theme.colors.surface;
          let labelColor = theme.colors.textSecondary;
          let iconColor = tab.accent;

          if (isActive) {
            if (isAll) {
              backgroundColor = theme.colors.primary;
              labelColor = theme.colors.onPrimary;
              iconColor = theme.colors.onPrimary;
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

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    tabBar: {
      backgroundColor: theme.colors.surface,
      minHeight: 48,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    tabBarScroll: { flex: 1 },
    tabBarContent: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      alignItems: "center",
      paddingHorizontal: theme.spacing.lg,
    },
    tab: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.pill,
      minHeight: 36,
    },
    tabLabel: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
    },
    eventsIcon: {
      width: 16,
      height: 16,
    },
  });
}
