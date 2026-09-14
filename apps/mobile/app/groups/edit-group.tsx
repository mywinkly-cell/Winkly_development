import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAppTheme, type AppTheme } from "@/constants/design-system";

type Styles = ReturnType<typeof createStyles>;

export default function EditGroup() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
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
        <Header title="Edit group" onBack={() => router.back()} onSave={onSave} theme={theme} styles={styles} />

        <View style={styles.card}>
          <Text style={styles.title}>Update group</Text>
          <Text style={styles.subtitle}>MVP screen (no persistence yet).</Text>

          <Label text="Group name" styles={styles} />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Group name…"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
          />

          <Label text="Description (optional)" styles={styles} />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="About the group…"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
            multiline
          />

          <Label text="Location (optional)" styles={styles} />
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="City…"
            placeholderTextColor={theme.colors.textMuted}
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

    primaryBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radii.md, paddingVertical: 12, alignItems: "center", marginTop: 4 },
    primaryText: { ...theme.type.button, color: theme.colors.onPrimary },

    secondaryBtn: { backgroundColor: theme.colors.backgroundMuted, borderRadius: theme.radii.md, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: theme.colors.border, marginTop: 10 },
    secondaryText: { ...theme.type.button, color: theme.colors.textPrimary },
  });
}
