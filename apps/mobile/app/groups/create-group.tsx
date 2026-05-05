/**
 * Create group — name, mode, optional description; select participants; send invitations.
 * No one is auto-added: invitees receive a group chat invitation and must Accept or Decline.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { Colors, Typography, Layout } from "@/constants/tokens";
import { createGroupWithInvites } from "@/lib/groupInvitations";
import { getPartnersForConcierge } from "@/lib/ai/conciergePartners";
import type { ConciergePartner } from "@/lib/ai/conciergePartners";
import type { Mode } from "@/types";

const MODES: { key: Mode; label: string }[] = [
  { key: "friends", label: "Friends" },
  { key: "business", label: "Business" },
];

export default function CreateGroup() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<Mode>("friends");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [partners, setPartners] = useState<ConciergePartner[]>([]);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadPartners = useCallback(async () => {
    setLoadingPartners(true);
    try {
      const list = await getPartnersForConcierge(mode);
      setPartners(list);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        list.forEach((p) => next.delete(p.id));
        return next;
      });
    } catch {
      setPartners([]);
    } finally {
      setLoadingPartners(false);
    }
  }, [mode]);

  useEffect(() => {
    loadPartners();
  }, [loadPartners]);

  const togglePartner = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Please enter a group name.");
      return;
    }
    setSubmitting(true);
    try {
      const { groupId } = await createGroupWithInvites({
        name: name.trim(),
        mode,
        description: description.trim() || undefined,
        inviteeUserIds: [...selectedIds],
      });
      Alert.alert(
        "Group created",
        selectedIds.size > 0
          ? `Invitations sent to ${selectedIds.size} ${selectedIds.size === 1 ? "person" : "people"}. They can accept or decline.`
          : "You can invite people from the group details.",
        [
          {
            text: "OK",
            onPress: () =>
              router.replace({
                pathname: "/groups/group-details",
                params: { id: groupId, name: name.trim() },
              }),
          },
        ]
      );
    } catch (e) {
      Alert.alert("Error", (e as Error).message ?? "Could not create group.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Header title="Create group" onBack={() => router.back()} />

        <View style={styles.card}>
          <Text style={styles.title}>New community</Text>
          <Text style={styles.subtitle}>
            Create a group for meetups, business circles, or shared interests. Invited people will receive a request and can Accept or Decline.
          </Text>

          <Label text="Group name" />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Munich Latte Lovers"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
          />

          <Label text="Type" />
          <View style={styles.modeRow}>
            {MODES.map((m) => (
              <TouchableOpacity
                key={m.key}
                onPress={() => setMode(m.key)}
                style={[styles.modeChip, mode === m.key && styles.modeChipActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.modeChipText, mode === m.key && styles.modeChipTextActive]}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Label text="Description (optional)" />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="What is this group about?"
            placeholderTextColor={Colors.gray500}
            style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
            multiline
          />

          <Label text="Invite people (optional)" />
          <Text style={styles.hint}>Select connections to invite. They will receive a group invitation and must accept to join.</Text>
          {loadingPartners ? (
            <ActivityIndicator size="small" color={Colors.primaryViolet} style={{ marginVertical: 12 }} />
          ) : partners.length === 0 ? (
            <Text style={styles.emptyHint}>No connections yet in this mode. Create the group and invite later from group details.</Text>
          ) : (
            <View style={styles.partnerList}>
              {partners.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => togglePartner(p.id)}
                  style={[styles.partnerRow, selectedIds.has(p.id) && styles.partnerRowSelected]}
                >
                  <View style={styles.partnerAvatar}>
                    {p.avatar_url ? (
                      <Text style={styles.partnerAvatarText}>{p.displayName.slice(0, 1).toUpperCase()}</Text>
                    ) : (
                      <Text style={styles.partnerAvatarText}>{p.displayName.slice(0, 1).toUpperCase()}</Text>
                    )}
                  </View>
                  <Text style={styles.partnerName} numberOfLines={1}>{p.displayName}</Text>
                  <View style={[styles.checkbox, selectedIds.has(p.id) && styles.checkboxChecked]}>
                    {selectedIds.has(p.id) ? <Ionicons name="checkmark" size={18} color="#FFF" /> : null}
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          <TouchableOpacity
            onPress={onCreate}
            style={[styles.primaryBtn, submitting && styles.primaryBtnDisabled]}
            activeOpacity={0.9}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={Colors.accentYellow} />
            ) : (
              <Text style={styles.primaryText}>Create group & send invitations</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.secondaryBtn} activeOpacity={0.9}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </TouchableOpacity>
        </View>
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
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },
  card: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 16,
  },
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
  modeRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  modeChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray300,
  },
  modeChipActive: { borderColor: Colors.primaryViolet, backgroundColor: Colors.primaryViolet + "18" },
  modeChipText: { ...Typography.body, color: Colors.gray700 },
  modeChipTextActive: { color: Colors.primaryViolet, fontWeight: "600" },
  hint: { ...Typography.caption, color: Colors.gray600, marginBottom: 8 },
  emptyHint: { ...Typography.caption, color: Colors.gray500, marginBottom: 12, fontStyle: "italic" },
  partnerList: { marginBottom: 16, maxHeight: 220 },
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.gray100,
    marginBottom: 6,
  },
  partnerRowSelected: { backgroundColor: Colors.primaryViolet + "18", borderWidth: 1, borderColor: Colors.primaryViolet + "40" },
  partnerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryViolet + "30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  partnerAvatarText: { ...Typography.caption, fontWeight: "700", color: Colors.primaryViolet },
  partnerName: { flex: 1, ...Typography.body, color: Colors.textPrimary },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.gray400,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: Colors.primaryViolet, borderColor: Colors.primaryViolet },
  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnDisabled: { opacity: 0.7 },
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
});
