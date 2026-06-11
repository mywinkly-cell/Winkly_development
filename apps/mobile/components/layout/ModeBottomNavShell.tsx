// ModeBottomNavShell — Frosted glass (iOS) / elevated bar (Android) for mode tab bars

import React from "react";
import { View, Text, Pressable, Platform, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "@/lib/useSafeAreaInsets";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { HIT_SLOP } from "@/constants/a11y";
import { ModeSwitchCenterButton } from "@/components/layout/ModeSwitchCenterButton";
import { useDefaultModeNavTabs } from "@/lib/i18n/useModeNavTabs";

export type ModeNavTab = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type Mode = "romance" | "friends" | "business" | "events";

type Props = {
  mode: Mode;
  activeTab: string;
  activeColor: string;
  onNav: (tab: string) => void;
  tabs?: ModeNavTab[];
};

export function ModeBottomNavShell({ mode, activeTab, activeColor, onNav, tabs }: Props) {
  const defaultTabs = useDefaultModeNavTabs();
  const resolvedTabs = tabs ?? defaultTabs;
  const insets = useSafeAreaInsets();
  const inactiveColor = Colors.gray500;
  const barHeight = Layout.bottomBarHeight + insets.bottom;
  const paddingBottom = 16 + insets.bottom;

  return (
    <View
      style={[
        styles.shell,
        { height: barHeight },
        Platform.OS === "android" && styles.androidShell,
        Platform.OS === "android" && { borderTopColor: activeColor },
      ]}
    >
      {Platform.OS === "ios" ? (
        <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.androidBg]} />
      )}

      <View style={[styles.row, { paddingTop: 12, paddingBottom }]}>
        {resolvedTabs.slice(0, 2).map((tab) => (
          <NavTab
            key={tab.key}
            label={tab.label}
            icon={tab.icon}
            active={activeTab === tab.key}
            activeColor={activeColor}
            inactiveColor={inactiveColor}
            onPress={() => onNav(tab.key)}
          />
        ))}

        <ModeSwitchCenterButton mode={mode} />

        {resolvedTabs.slice(2).map((tab) => (
          <NavTab
            key={tab.key}
            label={tab.label}
            icon={tab.icon}
            active={activeTab === tab.key}
            activeColor={activeColor}
            inactiveColor={inactiveColor}
            onPress={() => onNav(tab.key)}
          />
        ))}
      </View>
    </View>
  );
}

function NavTab({
  label,
  icon,
  active,
  activeColor,
  inactiveColor,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  activeColor: string;
  inactiveColor: string;
  onPress: () => void;
}) {
  const color = active ? activeColor : inactiveColor;
  return (
    <Pressable
      onPress={onPress}
      style={styles.tab}
      hitSlop={HIT_SLOP}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Ionicons name={icon} size={24} color={color} />
      <Text style={[styles.tabLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: "visible",
  },
  androidShell: {
    borderTopWidth: 2,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  androidBg: {
    backgroundColor: Colors.white,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 48,
    minHeight: 48,
  },
  tabLabel: {
    ...Typography.navTabLabel,
    marginTop: 4,
  },
});
