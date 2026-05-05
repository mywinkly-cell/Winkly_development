// apps/mobile/app/wishlist/create.tsx
// Winkly – Wishlist: Create (MVP-safe)

import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { createWishlistItem } from "@/lib/wishlistStore";

export default function WishlistCreate() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [price, setPrice] = useState("");

  const onSave = () => {
    const clean = title.trim();
    if (!clean) {
      Alert.alert("Missing title", "Please add a title for your wishlist item.");
      return;
    }

    const created = createWishlistItem({ title: clean, description, url, price });
    router.replace({ pathname: "/wishlist/details", params: { id: created.id } });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Header title="New wishlist item" onBack={() => router.back()} onSave={onSave} />

        <View style={styles.card}>
          <Text style={styles.title}>Add an idea</Text>
          <Text style={styles.subtitle}>Keep it short and clear — you can refine later.</Text>

          <Label text="Title" />
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Tennis racket"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
          />

          <Label text="Description (optional)" />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Why you want it, size, color…"
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

          <TouchableOpacity onPress={onSave} style={styles.primaryBtn} activeOpacity={0.9}>
            <Text style={styles.primaryText}>Save item</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.secondaryBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.secondaryText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.note}>MVP: stored locally. Next: save to Supabase.</Text>
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
