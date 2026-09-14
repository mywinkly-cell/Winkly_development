import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  getOtherUserCoreFields,
  type OtherUserCoreFields,
} from "@/lib/profile/otherUserCore";
import { emptyPublicCoreProfile } from "@/lib/profile/publicModeProfile";
import { ModeProfilePublicView } from "@/components/profile/ModeProfilePublicView";
import { ProfileViewHeader } from "@/components/profile/ProfileViewHeader";
import { PrimaryButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default function EventsProfileView() {
  const { i18n } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const params = useLocalSearchParams<{ user_id?: string }>();

  const userId = useMemo(
    () => (typeof params.user_id === "string" ? params.user_id : ""),
    [params.user_id]
  );

  const [loading, setLoading] = useState(true);
  const [coreFields, setCoreFields] = useState<OtherUserCoreFields | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      if (!userId || !isUuid(userId)) {
        if (!cancelled) {
          setCoreFields(null);
          setLoading(false);
        }
        return;
      }

      const core = await getOtherUserCoreFields(userId);
      if (!cancelled) {
        setCoreFields(core);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const coreForView = useMemo(
    () => coreFields ?? emptyPublicCoreProfile(),
    [coreFields]
  );

  return (
    <View style={styles.screen}>
      <ProfileViewHeader onBack={() => router.back()} mode="events" rightSlot="none" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: theme.spacing.xxl }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.modeAccent("events").primary} />
            <Text style={styles.loadingText}>Loading profile…</Text>
          </View>
        ) : !coreFields ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Profile not found</Text>
            <Text style={styles.emptyBody}>
              This user may not have a public profile yet.
            </Text>

            <PrimaryButton
              title="Back to Events"
              onPress={() => router.push("/(modes)/events/discover")}
              style={{ ...styles.cta, backgroundColor: theme.modeAccent("events").primary }}
            />
          </View>
        ) : (
          <ModeProfilePublicView
            mode="events"
            core={coreForView}
            modeRow={null}
            locale={i18n?.language ?? "en"}
          />
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return {
    screen: { flex: 1, backgroundColor: theme.colors.background },
    center: { paddingVertical: theme.spacing.huge, alignItems: "center" as const, justifyContent: "center" as const },
    loadingText: { marginTop: theme.spacing.sm, color: theme.colors.textSecondary },
    empty: {
      marginHorizontal: theme.spacing.lg,
      borderWidth: 1,
      borderRadius: theme.radii.lg,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.lg,
      marginTop: theme.spacing.sm,
    },
    emptyTitle: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, fontWeight: "900" as const, color: theme.colors.textPrimary },
    emptyBody: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.xs },
    cta: { marginTop: theme.spacing.md },
  };
}
