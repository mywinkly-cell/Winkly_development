import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";

export default function GroupDetails() {
  const router = useRouter();
  const { id, name } = useLocalSearchParams<{ id?: string; name?: string }>();

  const groupId = String(id ?? "");
  const groupName = String(name ?? "Group");

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Group</Text>
          <TouchableOpacity
            onPress={() => router.push({ pathname: "/groups/edit-group", params: { id: groupId, name: groupName } })}
            style={styles.editBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{groupName}</Text>
          <Text style={styles.subtitle}>
            MVP group details screen. Next: real group data, rules, cover image, and tags.
          </Text>

          <View style={styles.hr} />

          <TouchableOpacity
            onPress={() => router.push({ pathname: "/groups/member-list", params: { groupId } })}
            style={styles.secondaryBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.secondaryText}>View members</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push({ pathname: "/groups/group-chat", params: { groupId } })}
            style={styles.primaryBtn}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryText}>Open group chat</Text>
          </TouchableOpacity>
        </View>
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
  headerTitle: { ...Typography.h3, color: Colors.textPrimary },
  editBtn: { width: 70, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.primaryViolet, alignItems: "center" },
  editText: { ...Typography.caption, color: Colors.accentYellow },

  card: { backgroundColor: "#FFF", borderRadius: Layout.radii.card, borderWidth: 1, borderColor: Colors.gray200, padding: 16 },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700 },

  hr: { height: 1, backgroundColor: Colors.gray200, marginVertical: 14 },

  primaryBtn: { backgroundColor: Colors.primaryViolet, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center", marginTop: 10 },
  primaryText: { ...Typography.button, color: Colors.accentYellow },

  secondaryBtn: { backgroundColor: Colors.gray100, borderRadius: Layout.radii.control, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: Colors.gray200, marginTop: 6 },
  secondaryText: { ...Typography.button, color: Colors.textPrimary },
});
