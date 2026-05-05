import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function CreateGroup() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");

  const onCreate = () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Please enter a group name.");
      return;
    }

    // MVP: no backend yet → just navigate to details with a fake id
    const groupId = `${Date.now()}`;
    router.replace({
      pathname: "/groups/group-details",
      params: { id: groupId, name: name.trim() },
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Header title="Create group" onBack={() => router.back()} />

        <View style={styles.card}>
          <Text style={styles.title}>New community</Text>
          <Text style={styles.subtitle}>
            Create a group for meetups, business circles, or shared interests.
          </Text>

          <Label text="Group name" />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Munich Latte Lovers"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
          />

          <Label text="Description (optional)" />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What is this group about?"
            placeholderTextColor={Colors.gray500}
            style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
            multiline
          />

          <Label text="Location (optional)" />
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Munich"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
          />

          <TouchableOpacity onPress={onCreate} style={styles.primaryBtn} activeOpacity={0.9}>
            <Text style={styles.primaryText}>Create group</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.secondaryBtn} activeOpacity={0.9}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.note}>MVP: groups are UI-only for now. Next: persist in Supabase.</Text>
      </ScrollView>
    </View>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
        <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 70 }} />
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
  headerTitle: { ...Typography.h3, color: Colors.textPrimary },

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

  primaryBtn: { backgroundColor: Colors.primaryViolet, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  primaryText: { ...Typography.button, color: Colors.accentYellow },

  secondaryBtn: { backgroundColor: Colors.gray100, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.gray200, marginTop: 10 },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },

  note: { ...Typography.caption, color: Colors.gray600, textAlign: "center", marginTop: 12 },
});
