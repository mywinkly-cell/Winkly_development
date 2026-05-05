import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function EditGroup() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; name?: string }>();

  const groupId = String(params.id ?? "");
  const [name, setName] = useState(String(params.name ?? ""));
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");

  const onSave = () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Group name cannot be empty.");
      return;
    }

    // MVP: no backend yet → go back to details
    router.replace({
      pathname: "/groups/group-details",
      params: { id: groupId, name: name.trim() },
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Header title="Edit group" onBack={() => router.back()} onSave={onSave} />

        <View style={styles.card}>
          <Text style={styles.title}>Update group</Text>
          <Text style={styles.subtitle}>MVP screen (no persistence yet).</Text>

          <Label text="Group name" />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Group name…"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
          />

          <Label text="Description (optional)" />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="About the group…"
            placeholderTextColor={Colors.gray500}
            style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
            multiline
          />

          <Label text="Location (optional)" />
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="City…"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
          />

          <TouchableOpacity onPress={onSave} style={styles.primaryBtn} activeOpacity={0.9}>
            <Text style={styles.primaryText}>Save changes</Text>
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
  headerTitle: { ...Typography.h3, color: Colors.textPrimary },
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

  primaryBtn: { backgroundColor: Colors.primaryViolet, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  primaryText: { ...Typography.button, color: Colors.accentYellow },

  secondaryBtn: { backgroundColor: Colors.gray100, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.gray200, marginTop: 10 },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },
});
