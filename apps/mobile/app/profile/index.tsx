// apps/mobile/app/profile/index.tsx
// Winkly – Profile Hub (v7.0, SDK 54 safe)
// Purpose: Premium profile hub with edit shortcuts + verification entry.

import React from "react";
import { View, Text, ScrollView, StyleSheet, Image, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Card, Header, ListRow, PrimaryButton, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { isModeAvailable } from "@/lib/modes/availability";
import { supabase } from "@/lib/supabase";

export default function ProfileIndex() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  const onSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.replace("/(auth)/signin");
    } catch {
      Alert.alert("Error", "Could not sign out. Please try again.");
    }
  };

  return (
    <View style={styles.screen}>
      <Header
        title="Profile"
        onBack={() => router.back()}
        trailing={<TextButton title="Sign out" onPress={onSignOut} style={styles.signOutBtn} />}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.heroCard}>
          <View style={styles.avatarWrap}>
            <Image
              source={require("../../assets/icons/winkly-emoji-shadow.png")}
              style={styles.avatar}
              resizeMode="contain"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>Your Winkly Profile</Text>
            <Text style={styles.meta}>Edit your core profile and mode-specific sections.</Text>

            <PrimaryButton title="View profile" onPress={() => router.push("/profile/view-profile")} />
          </View>
        </Card>

        <Text style={styles.sectionTitle}>Edit sections</Text>

        <Card padding="none" style={styles.rowsCard}>
          <ListRow
            title="Core profile"
            subtitle="Name, bio, city, languages, basics"
            onPress={() => router.push("/profile/edit-core")}
            style={styles.row}
          />
          <ListRow
            title="Romance"
            subtitle="Preferences, relationship goals, dating details"
            onPress={() => router.push("/profile/edit-romance")}
            style={styles.row}
          />
          <ListRow
            title="Friends"
            subtitle="Interests, activities, meetup style"
            onPress={() => router.push("/profile/edit-friends")}
            style={styles.row}
          />
          {isModeAvailable("business") ? (
            <ListRow
              title="Business"
              subtitle="Role, company, networking focus"
              onPress={() => router.push("/profile/edit-business")}
              style={styles.row}
            />
          ) : null}
          <ListRow
            title="Media"
            subtitle="Photos and profile visuals"
            onPress={() => router.push("/profile/edit-media")}
            style={styles.row}
          />
          <ListRow
            title="Verification"
            subtitle="Verify your photo to earn a verified badge"
            onPress={() => router.push("/account/photo-verification")}
            style={styles.row}
          />
        </Card>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    signOutBtn: { paddingHorizontal: 0 },
    heroCard: {
      flexDirection: "row",
      gap: theme.spacing.md,
      alignItems: "center",
      marginBottom: theme.spacing.lg,
    },
    avatarWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: theme.colors.backgroundMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    avatar: { width: 54, height: 54 },
    name: { ...theme.type.h3, fontFamily: theme.type.h3.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.xxs },
    meta: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.sm },
    sectionTitle: { ...theme.type.h3, fontFamily: theme.type.h3.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
    rowsCard: { overflow: "hidden" },
    row: { paddingHorizontal: theme.spacing.lg },
  });
}
