// apps/mobile/app/wishlist/details.tsx
// Winkly – Wishlist: Details (MVP-safe)
// Route expects params: id

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Linking } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { deleteWishlistItem, getWishlistItem, WishlistItem } from "@/lib/wishlistStore";

export default function WishlistDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [item, setItem] = useState<WishlistItem | null>(null);

  const refresh = () => {
    const found = getWishlistItem(String(id));
    setItem(found);
  };

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [id])
  );

  const onDelete = () => {
    Alert.alert("Delete item?", "This cannot be undone (MVP local).", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteWishlistItem(String(id));
          router.replace("/wishlist");
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

  if (!item) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.replace("/wishlist")} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
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
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
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

        <Text style={styles.note}>Next: connect to Supabase wishlist_items + sharing.</Text>
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

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 8 },
  price: { ...Typography.h3, color: Colors.primaryViolet, marginBottom: 12 },

  sectionTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 8, marginTop: 6 },
  body: { ...Typography.body, color: Colors.gray700 },

  link: { ...Typography.body, color: Colors.primaryViolet, textDecorationLine: "underline" },

  hr: { height: 1, backgroundColor: Colors.gray200, marginVertical: 14 },
  meta: { ...Typography.caption, color: Colors.gray600 },

  dangerBtn: {
    marginTop: 14,
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F2B8B8",
  },
  dangerText: { ...Typography.button, color: "#B00020" },

  primaryBtn: {
    marginTop: 14,
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryText: { ...Typography.button, color: Colors.accentYellow },

  subtitle: { ...Typography.body, color: Colors.gray700, marginTop: 6 },

  note: { ...Typography.caption, color: Colors.gray600, textAlign: "center", marginTop: 12 },
});
