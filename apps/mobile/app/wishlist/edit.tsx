// apps/mobile/app/wishlist/edit.tsx
// Winkly – Wishlist: Edit (MVP-safe)
// Route expects params: id

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { getWishlistItem, updateWishlistItem, WishlistItem } from "@/lib/wishlistStore";

export default function WishlistEdit() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loaded, setLoaded] = useState(false);
  const [item, setItem] = useState<WishlistItem | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          setLoading(true);
          const found = await getWishlistItem(String(id));
          setItem(found);
          if (found && !loaded) {
            setTitle(found.title);
            setDescription(found.description ?? "");
            setUrl(found.url ?? "");
            setPrice(found.price ?? "");
            setLoaded(true);
          }
        } finally {
          setLoading(false);
        }
      })();
    }, [id, loaded])
  );

  const onSave = async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Please add a title.");
      return;
    }

    try {
      setSaving(true);
      const updated = await updateWishlistItem(String(id), { title, description, url, price });
      if (!updated) {
        Alert.alert("Not found", "This item no longer exists.");
        router.replace("/wishlist");
        return;
      }
      router.replace({ pathname: "/wishlist/details", params: { id: updated.id } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save changes.";
      Alert.alert("Error", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={Colors.primaryViolet} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.replace("/wishlist")} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
              <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Edit</Text>
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
        <Header title="Edit item" onBack={() => router.back()} onSave={onSave} />

        <View style={styles.card}>
          <Text style={styles.title}>Update details</Text>
          <Text style={styles.subtitle}>Keep it clean. You can add a link for easy access.</Text>

          <Label text="Title" />
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title…"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
          />

          <Label text="Description (optional)" />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Notes…"
            placeholderTextColor={Colors.gray500}
            style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
            multiline
          />

          <Label text="Link (optional)" />
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://…"
            placeholderTextColor={Colors.gray500}
            autoCapitalize="none"
            style={styles.input}
          />

          <Label text="Price (optional)" />
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="e.g. €120"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
          />

          <TouchableOpacity onPress={() => void onSave()} disabled={saving} style={styles.primaryBtn} activeOpacity={0.9}>
            <Text style={styles.primaryText}>{saving ? "Saving…" : "Save changes"}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.secondaryBtn} activeOpacity={0.9}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

function Header({ title, onBack, onSave }: { title: string; onBack: () => void; onSave: () => void }) {
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
        <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <TouchableOpacity onPress={onSave} style={styles.saveBtn} activeOpacity={0.9}>
        <Text style={styles.saveText}>Save</Text>
      </TouchableOpacity>
    </View>
  );
}

function Label({ text }: { text: string }) {
  return <Text style={styles.label}>{text}</Text>;
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
  saveBtn: { width: 70, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.primaryViolet, alignItems: "center" },
  saveText: { ...Typography.caption, color: Colors.accentYellow },

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 14 },

  label: { ...Typography.caption, color: Colors.gray600, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: Layout.radii.control,
    backgroundColor: "#FFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: Colors.textPrimary,
    marginBottom: 12,
  },

  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  primaryText: { ...Typography.button, color: Colors.accentYellow },

  secondaryBtn: {
    backgroundColor: Colors.gray100,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.gray200,
    marginTop: 10,
  },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },

  note: { ...Typography.caption, color: Colors.gray600, textAlign: "center", marginTop: 12 },
});
