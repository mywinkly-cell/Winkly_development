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
import { Colors, Typography, Layout } from "@/constants/tokens";
import { listWishlistItems, WishlistItem } from "@/lib/wishlistStore";

export default function WishlistIndex() {
  const router = useRouter();
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
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
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
            placeholderTextColor={Colors.gray500}
            style={styles.search}
          />
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.primaryViolet} />
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  scroll: { padding: 20, paddingBottom: 40 },

  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  backBtn: {
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
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },
  addBtn: { width: 70, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.primaryViolet, alignItems: "center" },
  addText: { ...Typography.caption, color: Colors.accentYellow },

  searchWrap: { marginBottom: 12 },
  search: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
  },

  loadingWrap: { paddingVertical: 40, alignItems: "center" },

  sectionTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 10 },

  card: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 4 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 10 },

  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  metaPill: {
    ...Typography.caption,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  metaText: { ...Typography.caption, color: Colors.gray600 },

  open: { ...Typography.caption, color: Colors.primaryViolet },

  emptyCard: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 18,
    alignItems: "center",
    marginTop: 10,
  },
  emptyTitle: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6, textAlign: "center" },
  emptySub: { ...Typography.body, color: Colors.gray700, textAlign: "center", marginBottom: 14 },

  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    width: "100%",
  },
  primaryText: { ...Typography.button, color: Colors.accentYellow },
});
