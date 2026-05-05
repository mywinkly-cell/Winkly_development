// apps/mobile/components/layout/Header.tsx
// Profile left, Winkly logo center, Planner right (spec v8.1)

import React from "react";
import { View, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Layout, Shadow, HEADER } from "@/constants/tokens";

type HeaderProps = {
  onProfilePress?: () => void;
  onPlannerPress?: () => void;
};

export function Header({ onProfilePress, onPlannerPress }: HeaderProps) {
  const router = useRouter();

  const handleProfile = () => {
    Haptics.selectionAsync();
    onProfilePress?.() ?? router.push("/profile");
  };

  const handlePlanner = () => {
    Haptics.selectionAsync();
    onPlannerPress?.() ?? router.push("/planner");
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handleProfile} style={styles.iconBtn} activeOpacity={0.8}>
        <Ionicons name="person-circle-outline" size={HEADER.iconSize} color={Colors.textPrimary} />
      </TouchableOpacity>

      <Image
        source={require("../../assets/icons/winkly-logo.png")}
        resizeMode="contain"
        style={styles.logo}
      />

      <TouchableOpacity onPress={handlePlanner} style={styles.iconBtn} activeOpacity={0.8}>
        <Ionicons name="calendar-outline" size={HEADER.iconSize} color={Colors.primaryViolet} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    ...Layout.topHeaderBar,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    ...Shadow.card,
  },
  iconBtn: {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonRadius,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.button,
  },
  logo: {
    height: HEADER.titleFontSize,
    width: HEADER.titleFontSize * (120 / 40),
  },
});
