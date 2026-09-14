// apps/mobile/app/wishlist/details.tsx
// Winkly – Wishlist: Details (MVP-safe)
// Route expects params: id

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Linking, ActivityIndicator } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { deleteWishlistItem, getWishlistItem, WishlistItem } from "@/lib/wishlistStore";

export default function WishlistDetails() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { id } = useLocalSearchParams<{ id: string }>();

  const [item, setItem] = useState<WishlistItem | null>(null);

  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const found = await getWishlistItem(String(id));
      setItem(found);
    } catch {
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onDelete = () => {
    Alert.alert("Delete item?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            try {
              await deleteWishlistItem(String(id));
              router.replace("/wishlist");
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : "Could not delete item.";
              Alert.alert("Error", message);
            }
          })();
        },
      },
    ]);
  };

  const openLink = async () => {
    const url = item?.url?.trim();
    if (!url) return;

    const safe = url.startsWith("http://") || url.startsWith("https://") ? url : `https://${url}`;
    const can = await Linking.canOpenURL(safe);
    if (!can) {
      Alert.alert("Invalid link", "This link cannot be opened.");
      return;
    }
    Linking.openURL(safe);
  };

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.replace("/wishlist")} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Details</Text>
            <View style={{ width: 70 }} />
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Item not found</Text>
            <Text style={styles.subtitle}>It may have been deleted.</Text>
            <TouchableOpacity onPress={() => router.replace("/wishlist")} style={styles.primaryBtn} activeOpacity={0.9}>
              <Text style={styles.primaryText}>Go to wishlist</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Details</Text>
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/wishlist/edit", params: { id: item.id } })}
            style={styles.addBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.addText}>Edit</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{item.title}</Text>

          {!!item.price && <Text style={styles.price}>{item.price}</Text>}

          {!!item.description && (
            <>
              <Text style={styles.sectionTitle}>Notes</Text>
              <Text style={styles.body}>{item.description}</Text>
            </>
          )}

          {!!item.url && (
            <>
              <Text style={styles.sectionTitle}>Link</Text>
              <TouchableOpacity onPress={openLink} activeOpacity={0.85}>
                <Text style={styles.link}>{item.url}</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.hr} />

          <Text style={styles.meta}>
            Created {new Date(item.createdAt).toLocaleDateString()} • Updated{" "}
            {new Date(item.updatedAt).toLocaleDateString()}
          </Text>

          <TouchableOpacity onPress={onDelete} style={styles.dangerBtn} activeOpacity={0.9}>
            <Text style={styles.dangerText}>Delete item</Text>
          </TouchableOpacity>
        </View>

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

    card: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 16 },
    title: { ...theme.type.h2, color: theme.colors.textPrimary, marginBottom: 8 },
    price: { ...theme.type.h3, color: theme.colors.primary, marginBottom: 12 },

    sectionTitle: { ...theme.type.h3, color: theme.colors.textPrimary, marginBottom: 8, marginTop: 6 },
    body: { ...theme.type.body, color: theme.colors.textSecondary },

    link: { ...theme.type.body, color: theme.colors.primary, textDecorationLine: "underline" },

    hr: { height: 1, backgroundColor: theme.colors.border, marginVertical: 14 },
    meta: { ...theme.type.caption, color: theme.colors.textSecondary },

    dangerBtn: {
      marginTop: 14,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.errorBorder,
    },
    dangerText: { ...theme.type.button, color: theme.colors.error },

    primaryBtn: {
      marginTop: 14,
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      alignItems: "center",
    },
    primaryText: { ...theme.type.button, color: theme.colors.onPrimary },

    subtitle: { ...theme.type.body, color: theme.colors.textSecondary, marginTop: 6 },

    note: { ...theme.type.caption, color: theme.colors.textSecondary, textAlign: "center", marginTop: 12 },
  });
}
