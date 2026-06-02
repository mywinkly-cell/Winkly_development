/**
 * Business Home — search + quick filters sheet (advanced filters → full screen).
 */

import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, FontFamily } from "@/constants/tokens";
import {
  INDUSTRY_OPTIONS,
  ROLE_OPTIONS,
  INTEREST_POPULAR_BUSINESS,
} from "@/constants/profileOptions";
import {
  getBusinessFilters,
  setBusinessFilters,
  type BusinessFiltersState,
} from "@/lib/filters/businessFiltersStorage";

type Props = {
  visible: boolean;
  onClose: () => void;
  onApplied: (filters: BusinessFiltersState) => void;
};

export function BusinessSearchFilterSheet({ visible, onClose, onApplied }: Props) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [location, setLocation] = useState("");
  const [industries, setIndustries] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const saved = await getBusinessFilters();
      if (cancelled) return;
      setSearchQuery(saved.searchQuery);
      setLocation(saved.location);
      setIndustries(saved.industries);
      setRoles(saved.roles);
      setInterests(saved.interests);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const toggleChip = (arr: string[], val: string, setter: (v: string[]) => void, max: number) => {
    Haptics.selectionAsync();
    if (arr.includes(val)) setter(arr.filter((x) => x !== val));
    else if (arr.length < max) setter([...arr, val]);
  };

  const handleApply = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const current = await getBusinessFilters();
    const next: BusinessFiltersState = {
      ...current,
      searchQuery: searchQuery.trim(),
      location: location.trim(),
      industries,
      roles,
      interests,
    };
    await setBusinessFilters(next);
    onApplied(next);
    onClose();
  };

  const handleClear = async () => {
    const current = await getBusinessFilters();
    const next: BusinessFiltersState = {
      ...current,
      searchQuery: "",
      location: "",
      industries: [],
      roles: [],
      interests: [],
    };
    await setBusinessFilters(next);
    setSearchQuery("");
    setLocation("");
    setIndustries([]);
    setRoles([]);
    setInterests([]);
    onApplied(next);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn} accessibilityLabel="Close">
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Find professionals</Text>
          <TouchableOpacity onPress={() => void handleClear()} style={styles.headerBtn}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Search</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Name, role, company, interest…"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
            autoCapitalize="none"
            returnKeyType="search"
          />

          <Text style={[styles.label, { marginTop: 16 }]}>Location</Text>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="City or region"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
            autoCapitalize="words"
          />

          <Text style={styles.sectionTitle}>Industry</Text>
          <View style={styles.chipRow}>
            {INDUSTRY_OPTIONS.slice(0, 8).map((opt) => (
              <Chip
                key={opt}
                label={opt}
                active={industries.includes(opt)}
                onPress={() => toggleChip(industries, opt, setIndustries, 5)}
              />
            ))}
          </View>

          <Text style={styles.sectionTitle}>Role</Text>
          <View style={styles.chipRow}>
            {ROLE_OPTIONS.slice(0, 8).map((opt) => (
              <Chip
                key={opt}
                label={opt}
                active={roles.includes(opt)}
                onPress={() => toggleChip(roles, opt, setRoles, 5)}
              />
            ))}
          </View>

          <Text style={styles.sectionTitle}>Interests</Text>
          <View style={styles.chipRow}>
            {INTEREST_POPULAR_BUSINESS.slice(0, 10).map((opt) => (
              <Chip
                key={opt}
                label={opt}
                active={interests.includes(opt)}
                onPress={() => toggleChip(interests, opt, setInterests, 8)}
              />
            ))}
          </View>

          <TouchableOpacity
            onPress={() => {
              onClose();
              router.push("/(modes)/business/filters");
            }}
            style={styles.advancedLink}
          >
            <Text style={styles.advancedText}>Advanced filters (distance, languages, goals)</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.business.primary} />
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable onPress={() => void handleApply()} style={styles.applyBtn}>
            <Text style={styles.applyText}>Show results</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.backgroundLight },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  headerBtn: { minWidth: 56, minHeight: 40, justifyContent: "center" },
  headerTitle: {
    ...Typography.h3,
    fontFamily: FontFamily.heading,
    color: Colors.textPrimary,
  },
  clearText: { ...Typography.body, color: Colors.business.primary, fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 32 },
  label: { ...Typography.caption, color: Colors.gray700, marginBottom: 8, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.textPrimary,
    backgroundColor: Colors.white,
  },
  sectionTitle: {
    ...Typography.body,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginTop: 20,
    marginBottom: 10,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  chipActive: { backgroundColor: Colors.business.secondary, borderColor: Colors.business.primary },
  chipText: { ...Typography.caption, color: Colors.textPrimary },
  chipTextActive: { color: Colors.business.primary, fontWeight: "700" },
  advancedLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 28,
    paddingVertical: 12,
  },
  advancedText: { ...Typography.body, color: Colors.business.primary, flex: 1 },
  footer: {
    padding: 16,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    backgroundColor: Colors.white,
  },
  applyBtn: {
    backgroundColor: Colors.business.primary,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
  },
  applyText: { ...Typography.button, color: Colors.white },
});
