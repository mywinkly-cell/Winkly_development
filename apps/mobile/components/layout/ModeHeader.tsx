// ModeHeader — Shared header for mode screens and Planner
// Default: Profile (left) | Winkly (center) | Right slot (settings / filter+settings)
// Planner variant: Filter (left) | Winkly (center) | Settings (right) — no profile

import React, { useEffect, useState } from "react";
import { View, Image, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useModeContext } from "@/providers";
import { supabase } from "@/lib/supabase";
import { Colors, Layout, Shadow, Typography, FontFamily } from "@/constants/tokens";

type RightSlot = "settings" | "filterSettings" | "filters";
type ModeKey = "romance" | "friends" | "business" | "events";
export type HeaderVariant = "default" | "planner";

type ModeHeaderProps = {
  currentMode: ModeKey;
  rightSlot?: RightSlot;
  /** "planner" = Filter (left) | Winkly (center) | Settings (right); use on all Planner screens */
  variant?: HeaderVariant;
  /** When on Planner (variant or rightSlot filterSettings), use these on standalone Planner; else Filter → /planner, Settings → /planner/settings */
  onFilterPress?: () => void;
  onSettingsPress?: () => void;
};

export function ModeHeader({
  currentMode,
  rightSlot = "settings",
  variant = "default",
  onFilterPress,
  onSettingsPress,
}: ModeHeaderProps) {
  const router = useRouter();
  const { context } = useModeContext();
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const accountType = (context.account_type as "personal" | "business") ?? "personal";
  const isPlannerHeader = variant === "planner";

  useEffect(() => {
    if (isPlannerHeader) return;
    const loadPhoto = async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) return;

        if (accountType === "personal") {
          const { data: up } = await supabase
            .from("user_profiles")
            .select("main_photo_url, core_photos")
            .eq("id", userData.user.id)
            .maybeSingle();
          const photo =
            (up as { main_photo_url?: string; core_photos?: string[] } | null)?.main_photo_url ??
            (Array.isArray((up as { core_photos?: string[] })?.core_photos)
              ? (up as { core_photos: string[] }).core_photos?.[0]
              : null);
          if (photo) setProfilePhotoUri(photo);
        } else {
          const { data: bp } = await supabase
            .from("business_profiles")
            .select("logo_uri")
            .or(`id.eq.${userData.user.id},user_id.eq.${userData.user.id}`)
            .limit(1)
            .maybeSingle();
          const logo = (bp as { logo_uri?: string } | null)?.logo_uri;
          if (logo) setProfilePhotoUri(logo);
        }
      } catch {
        // Ignore
      }
    };

    loadPhoto();
  }, [accountType, isPlannerHeader]);

  const onProfilePress = () => {
    Haptics.selectionAsync();
    router.push(
      accountType === "personal"
        ? "/(onboarding-personal)/profile-core?edit=1"
        : "/(onboarding-business)/profile-business?edit=1"
    );
  };

  const onSettingsPressDefault = () => {
    Haptics.selectionAsync();
    router.push("/planner/settings");
  };

  const onFilterPressDefault = () => {
    Haptics.selectionAsync();
    router.push("/planner");
  };

  const handleFilterPress = () => {
    Haptics.selectionAsync();
    if ((rightSlot === "filterSettings" || isPlannerHeader) && onFilterPress) {
      onFilterPress();
    } else {
      onFilterPressDefault();
    }
  };

  const handleSettingsPress = () => {
    Haptics.selectionAsync();
    if ((rightSlot === "filterSettings" || isPlannerHeader) && onSettingsPress) {
      onSettingsPress();
    } else {
      onSettingsPressDefault();
    }
  };

  const onRightPress = () => {
    Haptics.selectionAsync();
    router.push("/account");
  };

  const handleFiltersOnlyPress = () => {
    Haptics.selectionAsync();
    if (onFilterPress) {
      onFilterPress();
    }
  };

  // Planner header: Filter (left) | Winkly (center) | Settings (right)
  if (isPlannerHeader) {
    return (
      <View style={styles.container}>
        <TouchableOpacity
          onPress={handleFilterPress}
          style={styles.rightBtn}
          activeOpacity={0.8}
          accessibilityLabel="Planner filters"
        >
          <Ionicons name="filter" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.centerTitleWrap}>
          <Text style={styles.centerTitle}>Winkly</Text>
        </View>
        <TouchableOpacity
          onPress={handleSettingsPress}
          style={styles.rightBtn}
          activeOpacity={0.8}
          accessibilityLabel="Planner settings"
        >
          <Ionicons name="settings" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        onPress={onProfilePress}
        style={styles.profileBtn}
        activeOpacity={0.8}
        accessibilityLabel="Open profile setup"
      >
        <View style={styles.profileBtnInner}>
          {profilePhotoUri ? (
            <Image source={{ uri: profilePhotoUri }} style={styles.avatar} resizeMode="cover" />
          ) : (
            <Ionicons name="person-circle-outline" size={36} color={Colors.textPrimary} />
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.centerTitleWrap}>
        <Text style={styles.centerTitle}>Winkly</Text>
      </View>

      {rightSlot === "filterSettings" ? (
        <View style={styles.rightRow}>
          <TouchableOpacity
            onPress={handleFilterPress}
            style={styles.rightBtn}
            accessibilityLabel="Planner filters"
          >
            <Ionicons name="filter" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSettingsPress}
            style={[styles.rightBtn, styles.rightBtnSpacer]}
            accessibilityLabel="Planner settings"
          >
            <Ionicons name="settings" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
      ) : rightSlot === "filters" ? (
        <TouchableOpacity
          onPress={handleFiltersOnlyPress}
          style={styles.rightBtn}
          accessibilityLabel="Filtering"
        >
          <Ionicons
            name="options-outline"
            size={22}
            color={
              currentMode === "romance"
                ? Colors.romance.primary
                : currentMode === "friends"
                  ? Colors.friends.primary
                  : currentMode === "business"
                    ? Colors.business.primary
                    : Colors.textPrimary
            }
          />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={onRightPress}
          style={styles.rightBtn}
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
      )}
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
  profileBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 6,
  },
  profileBtnInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 44,
    height: 44,
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
  rightBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  rightBtnSpacer: { marginLeft: 8 },
  rightRow: {
    flexDirection: "row",
    alignItems: "center",
  },
});
