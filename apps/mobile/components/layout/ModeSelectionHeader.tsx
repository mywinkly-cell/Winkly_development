// ────────────────────────────────────────────────
// Mode Selection Header — Profile | Winkly | Settings (optional)
// Settings icon shown only on the Mode Selection home tab, not on Chats or Planner.
// ────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Image } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { useModeContext } from "@/providers";
import { Colors, Layout, Typography, FontFamily, HEADER, Shadow } from "@/constants/tokens";

type AccountType = "personal" | "business";

type ModeSelectionHeaderProps = {
  /** Show General settings icon (Winkly Violet). Only true on Mode Selection home tab. */
  showSettingsIcon?: boolean;
};

export function ModeSelectionHeader({ showSettingsIcon = false }: ModeSelectionHeaderProps) {
  const router = useRouter();
  const { context } = useModeContext();
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const accountType = (context.account_type as AccountType) ?? "personal";

  useEffect(() => {
    const loadPhoto = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) return;

        if (accountType === "personal") {
          const { data: up } = await supabase
            .from("user_profiles")
            .select("main_photo_url, core_photos")
            .eq("id", userData.user.id)
            .maybeSingle();
          const photo = (up as { main_photo_url?: string; core_photos?: string[] } | null)?.main_photo_url ??
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
  }, [accountType]);

  const leftBtnStyle = {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonRadius,
    backgroundColor: Colors.gray100,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    ...Shadow.button,
  };
  const rightBtnStyle = {
    width: HEADER.buttonSize,
    height: HEADER.buttonSize,
    borderRadius: HEADER.buttonRadius,
    backgroundColor: Colors.primaryViolet + "18",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    ...Shadow.button,
  };

  return (
    <View
      style={{
        paddingHorizontal: 16,
        ...Layout.topHeaderBar,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: Colors.white,
        borderBottomWidth: 1,
        borderBottomColor: Colors.gray200,
        ...Shadow.card,
      }}
    >
      <TouchableOpacity
        onPress={() => {
          Haptics.selectionAsync();
          router.push(
            accountType === "personal"
              ? "/(onboarding-personal)/profile-core?edit=1"
              : "/(onboarding-business)/profile-business?edit=1"
          );
        }}
        activeOpacity={0.8}
        style={leftBtnStyle}
        accessibilityRole="button"
        accessibilityLabel="Your profile"
      >
        <View style={{ width: HEADER.buttonSize, height: HEADER.buttonSize, borderRadius: HEADER.buttonRadius, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
          {profilePhotoUri ? (
            <Image source={{ uri: profilePhotoUri }} style={{ width: HEADER.buttonSize, height: HEADER.buttonSize }} resizeMode="cover" />
          ) : (
            <Ionicons name="person-circle-outline" size={HEADER.iconSize} color={Colors.textPrimary} />
          )}
        </View>
      </TouchableOpacity>

      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text
          style={{
            ...Typography.headerWinklyTitle,
            fontFamily: FontFamily.headingBold,
            color: Colors.primaryViolet,
            textAlign: "center",
          }}
        >
          Winkly
        </Text>
      </View>

      {showSettingsIcon ? (
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            router.push("/account");
          }}
          activeOpacity={0.8}
          style={rightBtnStyle}
          accessibilityRole="button"
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings" size={HEADER.iconSize} color={Colors.primaryViolet} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: HEADER.buttonSize, height: HEADER.buttonSize }} />
      )}
    </View>
  );
}
