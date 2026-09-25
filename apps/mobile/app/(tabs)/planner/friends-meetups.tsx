// apps/mobile/app/planner/friends-meetups.tsx
// Winkly – Planner: Friends Meetups

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, RefreshControl, StyleSheet } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Card, Header, Input, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { supabase } from "@/lib/supabase";
import { getGroupMeetups, type GroupMeetup } from "@/lib/access/planner";
import { useAppLocaleTag } from "@/lib/i18n/appLocale";

function formatTimeLabel(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(locale, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FriendsMeetups() {
  const router = useRouter();
  const { t } = useTranslation();
  const appLocale = useAppLocaleTag();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GroupMeetup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const me = auth.user?.id;
      if (!me) {
        setItems([]);
        return;
      }
      setItems(await getGroupMeetups(me, "friends"));
    } catch {
      // keep prior
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => (x.title ?? "").toLowerCase().includes(q));
  }, [items, query]);

  return (
    <View style={styles.screen}>
      <Header
        title={t("planner.meetupsScreen.title")}
        onBack={() => router.back()}
        trailing={
          <TextButton title={t("planner.meetupsScreen.groups")} onPress={() => router.push({ pathname: "/groups", params: { mode: "friends" } })} style={styles.headerAction} />
        }
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <Card style={styles.card}>
          <Text style={styles.title}>{t("planner.meetupsScreen.heading")}</Text>
          <Text style={styles.subtitle}>{t("planner.meetupsScreen.subtitle")}</Text>

          <Input value={query} onChangeText={setQuery} placeholder={t("planner.meetupsScreen.searchPlaceholder")} containerStyle={styles.searchContainer} />
        </Card>

        {loading ? (
          <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: theme.spacing.xxl }} />
        ) : filtered.length === 0 ? (
          <Card style={styles.itemCard}>
            <Text style={styles.itemSub}>{t("planner.meetupsScreen.empty")}</Text>
          </Card>
        ) : (
          filtered.map((it) => (
            <Card key={it.id} style={styles.itemCard}>
              <View style={styles.itemTop}>
                <Text style={styles.itemTitle} numberOfLines={1}>
                  {it.title}
                </Text>
                <Text style={styles.badge}>{t("planner.meetupsScreen.people", { count: it.participant_count })}</Text>
              </View>
              <Text style={styles.itemSub}>{formatTimeLabel(it.starts_at, appLocale)}</Text>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    headerAction: { paddingHorizontal: 0 },
    card: { marginBottom: theme.spacing.md },
    title: { ...theme.type.h2, fontFamily: theme.type.h2.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.xxs },
    subtitle: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
    searchContainer: { marginBottom: 0 },
    itemCard: { marginBottom: theme.spacing.md },
    itemTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: theme.spacing.sm },
    itemTitle: { ...theme.type.h3, fontFamily: theme.type.h3.fontFamily, color: theme.colors.textPrimary, flexShrink: 1 },
    badge: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.primary },
    itemSub: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
  });
}
