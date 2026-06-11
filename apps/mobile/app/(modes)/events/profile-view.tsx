import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
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
import { Colors, Layout } from "@/constants/tokens";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default function EventsProfileView() {
  const { i18n } = useTranslation();
  const router = useRouter();
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
    <View style={[styles.screen, { backgroundColor: Colors.backgroundLight }]}>
      <ProfileViewHeader onBack={() => router.back()} mode="events" rightSlot="none" />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.events.primary} />
            <Text style={{ marginTop: 10, color: Colors.mutedText }}>Loading profile…</Text>
          </View>
        ) : !coreFields ? (
          <View style={[styles.empty, { backgroundColor: Colors.card, borderColor: Colors.border }]}>
            <Text style={{ color: Colors.text, fontWeight: "900" }}>Profile not found</Text>
            <Text style={{ color: Colors.mutedText, marginTop: 6, lineHeight: 18 }}>
              This user may not have a public profile yet.
            </Text>

            <TouchableOpacity
              onPress={() => router.push("/(modes)/events/discover")}
              style={[styles.cta, { backgroundColor: Colors.events.primary }]}
              activeOpacity={0.9}
            >
              <Text style={{ color: Colors.onPrimary, fontWeight: "900" }}>Back to Events</Text>
            </TouchableOpacity>
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

const styles: Record<string, object> = {
  screen: { flex: 1 },
  center: { paddingVertical: 40, alignItems: "center", justifyContent: "center" },
  empty: {
    marginHorizontal: Layout?.screenPadding ?? 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    marginTop: 10,
  },
  cta: { marginTop: 12, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
};
