// apps/mobile/app/wishlist/index.tsx
// The wishlist: places you want to go — saved from a reel, a friend's tip, an event venue —
// so next time you look for somewhere to go, they're here (and Winkly AI suggests them).
// Opened from the bookmark icon in the Planner header.

import React, { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, Alert, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Header, Screen, Chip, Card, PrimaryButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { VenuePhoto } from "@/components/ui/VenuePhoto";
import { SHARE_MODE_LABEL_KEYS } from "@/components/wishlist/WishlistForm";
import { useModeContext } from "@/providers/ModeContextProvider";
import {
  getWishlistShareAllModes,
  listWishlistItems,
  setWishlistShareAllModes,
  SHAREABLE_MODES,
  type ShareableMode,
  type WishlistItem,
} from "@/lib/wishlistStore";

type Show = "open" | "visited";

export default function WishlistIndex() {
  const router = useRouter();
  const theme = useAppTheme();
  const { t } = useTranslation();
  const { context } = useModeContext();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [shareAll, setShareAll] = useState<ShareableMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("open");
  const [city, setCity] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void Promise.all([listWishlistItems({ includeVisited: true }), getWishlistShareAllModes().catch(() => [])])
        .then(([rows, modes]) => {
          if (cancelled) return;
          setItems(rows);
          setShareAll(modes);
        })
        .catch(() => {
          if (!cancelled) Alert.alert(t("wishlist.loadFailedTitle"), t("wishlist.loadFailed"));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [t])
  );

  const cities = useMemo(() => {
    const seen = new Map<string, string>();
    for (const it of items) {
      const c = it.city?.trim();
      if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
    }
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (show === "open" ? !!it.visitedAt : !it.visitedAt) return false;
      if (city && (it.city ?? "").toLowerCase() !== city.toLowerCase()) return false;
      if (!q) return true;
      return [it.title, it.description, it.address, it.city].some((x) => (x ?? "").toLowerCase().includes(q));
    });
  }, [items, query, show, city]);

  const shareable = SHAREABLE_MODES.filter((m) => context.permissions.includes(m));
  const toggleShareAll = async (m: ShareableMode) => {
    const prev = shareAll;
    const next = prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m];
    setShareAll(next);
    try {
      await setWishlistShareAllModes(next);
    } catch {
      setShareAll(prev);
      Alert.alert(t("catalog.saveFailedTitle"), t("catalog.saveFailed"));
    }
  };

  const openCount = items.filter((i) => !i.visitedAt).length;
  const visitedCount = items.length - openCount;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header
        onBack
        title={t("wishlist.title")}
        trailing={
          <Pressable
            onPress={() => router.push("/wishlist/create")}
            accessibilityRole="button"
            accessibilityLabel={t("wishlist.addA11y")}
            hitSlop={8}
          >
            <Ionicons name="add-circle" size={28} color={theme.colors.primary} />
          </Pressable>
        }
      />
      <Screen>
        <Text style={[theme.type.body, { color: theme.colors.textSecondary, marginTop: theme.spacing.lg, marginBottom: theme.spacing.md }]}>
          {t("wishlist.intro")}
        </Text>

        <View style={[styles.search, { borderColor: theme.colors.border, borderRadius: theme.radii.md }]}>
          <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("wishlist.searchPlaceholder")}
            placeholderTextColor={theme.colors.textMuted}
            style={[theme.type.body, { flex: 1, color: theme.colors.textPrimary }]}
          />
        </View>

        <View style={styles.chips}>
          <Chip label={t("wishlist.toVisit", { count: openCount })} selected={show === "open"} onPress={() => setShow("open")} />
          <Chip label={t("wishlist.visited", { count: visitedCount })} selected={show === "visited"} onPress={() => setShow("visited")} />
        </View>
        {cities.length > 1 ? (
          <View style={styles.chips}>
            <Chip label={t("wishlist.allCities")} selected={city === null} onPress={() => setCity(null)} />
            {cities.map((c) => (
              <Chip key={c} label={c} selected={city === c} onPress={() => setCity(c)} />
            ))}
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginVertical: theme.spacing.xxl }} />
        ) : items.length === 0 ? (
          <Card padding="lg" style={{ alignItems: "center", marginTop: theme.spacing.md }}>
            <Ionicons name="bookmark-outline" size={36} color={theme.colors.primary} />
            <Text style={[theme.type.h3, { color: theme.colors.textPrimary, marginTop: theme.spacing.sm, textAlign: "center" }]}>
              {t("wishlist.emptyTitle")}
            </Text>
            <Text style={[theme.type.body, { color: theme.colors.textSecondary, textAlign: "center", marginVertical: theme.spacing.md }]}>
              {t("wishlist.emptyBody")}
            </Text>
            <PrimaryButton title={t("wishlist.addFirst")} onPress={() => router.push("/wishlist/create")} />
          </Card>
        ) : visible.length === 0 ? (
          <Text style={[theme.type.body, { color: theme.colors.textSecondary, marginVertical: theme.spacing.lg }]}>
            {t("wishlist.noMatches")}
          </Text>
        ) : (
          <View style={styles.grid}>
            {visible.map((it) => (
              <Pressable
                key={it.id}
                onPress={() => router.push({ pathname: "/wishlist/details", params: { id: it.id } })}
                style={({ pressed }) => [
                  styles.tile,
                  { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.lg, opacity: pressed ? 0.85 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={it.title}
              >
                <VenuePhoto
                  source={{ imageUrl: it.imageUrl, placeId: it.placeId, name: it.title, city: it.city, latitude: it.latitude, longitude: it.longitude }}
                  style={styles.tilePhoto}
                  width={400}
                  icon="bookmark-outline"
                />
                <View style={{ padding: theme.spacing.sm }}>
                  <Text style={[theme.type.bodyMedium, { color: theme.colors.textPrimary }]} numberOfLines={2}>
                    {it.title}
                  </Text>
                  <View style={styles.tileMeta}>
                    {it.city ? (
                      <Text style={[theme.type.caption, { color: theme.colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                        {it.city}
                      </Text>
                    ) : (
                      <View style={{ flex: 1 }} />
                    )}
                    {it.sharedModes.length || shareAll.length ? (
                      <Ionicons name="people-outline" size={14} color={theme.colors.textMuted} accessibilityLabel={t("wishlist.sharedA11y")} />
                    ) : null}
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {shareable.length > 0 && items.length > 0 ? (
          <Card padding="md" style={{ marginTop: theme.spacing.xl }}>
            <Text style={[theme.type.bodyMedium, { color: theme.colors.textPrimary }]}>{t("wishlist.shareAllTitle")}</Text>
            <Text style={[theme.type.caption, { color: theme.colors.textSecondary, marginVertical: theme.spacing.xs }]}>
              {t("wishlist.shareAllBody")}
            </Text>
            <View style={styles.chips}>
              {shareable.map((m) => (
                <Chip
                  key={m}
                  label={t(SHARE_MODE_LABEL_KEYS[m])}
                  selected={shareAll.includes(m)}
                  onPress={() => void toggleShareAll(m)}
                />
              ))}
            </View>
          </Card>
        ) : null}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  tile: { width: "48.5%", borderWidth: 1, overflow: "hidden" },
  tilePhoto: { width: "100%", height: 110 },
  tileMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
});
