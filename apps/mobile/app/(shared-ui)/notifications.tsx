import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { supabase } from "@/lib/supabase";

type NotificationItem = {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read?: boolean;
};

export default function Notifications() {
  const { t } = useTranslation();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,created_at,read")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error || !data) {
        setItems([]);
        return;
      }

      setItems(data as NotificationItem[]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>{t("notifications.inboxTitle")}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={{ marginTop: 8, color: theme.colors.textSecondary }}>{t("common.loading")}</Text>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ color: theme.colors.textPrimary, fontWeight: "900" }}>{t("notifications.emptyTitle")}</Text>
            <Text style={{ color: theme.colors.textSecondary, marginTop: 6 }}>
              {t("notifications.emptySubtitle")}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            {items.map((n) => (
              <View
                key={n.id}
                style={[styles.card, { opacity: n.read ? 0.7 : 1 }]}
              >
                <Text style={{ color: theme.colors.textPrimary, fontWeight: "900" }}>{n.title}</Text>
                <Text style={{ color: theme.colors.textPrimary, marginTop: 6 }}>{n.body}</Text>
                <Text style={{ color: theme.colors.textSecondary, marginTop: 8, fontSize: 12 }}>
                  {new Date(n.created_at).toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return {
    screen: { flex: 1, paddingTop: theme.spacing.md, backgroundColor: theme.colors.background },
    header: { paddingHorizontal: theme.spacing.xl, paddingBottom: 12 },
    title: { ...theme.type.h2, fontWeight: "900" as const, color: theme.colors.textPrimary },

    center: { paddingVertical: 40, alignItems: "center" as const },

    empty: {
      marginHorizontal: theme.spacing.xl,
      borderWidth: 1,
      borderRadius: 18,
      padding: 16,
      marginTop: 8,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },

    card: {
      marginHorizontal: theme.spacing.xl,
      borderWidth: 1,
      borderRadius: 18,
      padding: 14,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
  };
}
