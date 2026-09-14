// apps/mobile/app/wishlist/create.tsx
// Winkly – Wishlist: Create (MVP-safe)

import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { createWishlistItem } from "@/lib/wishlistStore";

type Styles = ReturnType<typeof createStyles>;

export default function WishlistCreate() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");

  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    const clean = title.trim();
    if (!clean) {
      Alert.alert("Missing title", "Please add a title for your wishlist item.");
      return;
    }

    try {
      setSaving(true);
      const created = await createWishlistItem({ title: clean, description, url, price });
      router.replace({ pathname: "/wishlist/details", params: { id: created.id } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save item.";
      Alert.alert("Error", message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Header title="New wishlist item" onBack={() => router.back()} onSave={onSave} theme={theme} styles={styles} />

        <View style={styles.card}>
          <Text style={styles.title}>Add an idea</Text>
          <Text style={styles.subtitle}>Keep it short and clear — you can refine later.</Text>

          <Label text="Title" styles={styles} />
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Tennis racket"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
          />

          <Label text="Description (optional)" styles={styles} />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Why you want it, size, color…"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
            multiline
          />

          <Label text="Link (optional)" styles={styles} />
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://…"
            placeholderTextColor={theme.colors.textMuted}
            autoCapitalize="none"
            style={styles.input}
          />

          <Label text="Price (optional)" styles={styles} />
          <TextInput
            value={price}
            onChangeText={setPrice}
            placeholder="e.g. €120"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
          />

          <TouchableOpacity onPress={() => void onSave()} disabled={saving} style={styles.primaryBtn} activeOpacity={0.9}>
            <Text style={styles.primaryText}>{saving ? "Saving…" : "Save item"}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.secondaryBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.secondaryText}>Cancel</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

function Header({ title, onBack, onSave, theme, styles }: { title: string; onBack: () => void; onSave: () => void; theme: AppTheme; styles: Styles }) {
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
        <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <TouchableOpacity onPress={onSave} style={styles.saveBtn} activeOpacity={0.9}>
        <Text style={styles.saveText}>Save</Text>
      </TouchableOpacity>
    </View>
  );
}

function Label({ text, styles }: { text: string; styles: Styles }) {
  return <Text style={styles.label}>{text}</Text>;
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
    saveBtn: { width: 70, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: "center" },
    saveText: { ...theme.type.caption, color: theme.colors.onPrimary },

    card: { backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, borderWidth: 1, borderColor: theme.colors.border, padding: 16 },
    title: { ...theme.type.h2, color: theme.colors.textPrimary, marginBottom: 6 },
    subtitle: { ...theme.type.body, color: theme.colors.textSecondary, marginBottom: 14 },

    label: { ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: 6 },
    input: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: theme.colors.textPrimary,
      marginBottom: 12,
    },

    primaryBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 4,
    },
    primaryText: { ...theme.type.button, color: theme.colors.onPrimary },

    secondaryBtn: {
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginTop: 10,
    },
    secondaryText: { ...theme.type.button, color: theme.colors.textPrimary },

    note: { ...theme.type.caption, color: theme.colors.textSecondary, textAlign: "center", marginTop: 12 },
  });
}
