// apps/mobile/app/wishlist/index.tsx
// Wishlist list + search (Supabase-backed).

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { listWishlistItems, WishlistItem } from "@/lib/wishlistStore";

export default function WishlistIndex() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await listWishlistItems();
      setItems(rows);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not load wishlist.";
      Alert.alert("Error", message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((x) => {
      const hay = `${x.title} ${x.description ?? ""} ${x.url ?? ""} ${x.price ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [items, query]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Wishlist</Text>
          <TouchableOpacity
            onPress={() => router.push("/wishlist/create")}
            style={styles.addBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.addText}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search wishlist…"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.search}
          />
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No items yet</Text>
            <Text style={styles.emptySub}>
              Add gifts, goals, or ideas you want to remember. Saved to your account.
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/wishlist/create")}
              style={styles.primaryBtn}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryText}>Create first item</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Your items</Text>

            {filtered.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => router.push({ pathname: "/wishlist/details", params: { id: item.id } })}
                style={styles.card}
                activeOpacity={0.9}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{item.title}</Text>
                  {!!item.description && (
                    <Text style={styles.subtitle} numberOfLines={2}>
                      {item.description}
                    </Text>
                  )}
                  <View style={styles.metaRow}>
                    {!!item.price && <Text style={styles.metaPill}>{item.price}</Text>}
                    <Text style={styles.metaText}>
                      Updated {new Date(item.updatedAt).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.open}>Open</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scroll: { padding: 20, paddingBottom: 40 },

    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
      ...theme.elevation(1),
    },
    headerTitle: { ...theme.type.h2, color: theme.colors.textPrimary },
    addBtn: { width: 70, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: "center" },
    addText: { ...theme.type.caption, color: theme.colors.onPrimary },

    searchWrap: { marginBottom: 12 },
    search: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.colors.textPrimary,
    },

    loadingWrap: { paddingVertical: 40, alignItems: "center" },

    sectionTitle: { ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: 10 },

    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      marginBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    title: { ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: 4 },
    subtitle: { ...theme.type.body, color: theme.colors.textSecondary, marginBottom: 10 },

    metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
    metaPill: {
      ...theme.type.caption,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.backgroundMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
    },
    metaText: { ...theme.type.caption, color: theme.colors.textSecondary },

    open: { ...theme.type.caption, color: theme.colors.primary },

    emptyCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 18,
      alignItems: "center",
      marginTop: 10,
    },
    emptyTitle: { ...theme.type.h2, color: theme.colors.textPrimary, marginBottom: 6, textAlign: "center" },
    emptySub: { ...theme.type.body, color: theme.colors.textSecondary, textAlign: "center", marginBottom: 14 },

    primaryBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      paddingHorizontal: 16,
      alignItems: "center",
      width: "100%",
    },
    primaryText: { ...theme.type.button, color: theme.colors.onPrimary },
  });
}
