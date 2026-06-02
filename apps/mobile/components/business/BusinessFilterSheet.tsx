/**
 * Business Discover — advanced filter bottom sheet (Modal variant sheet).
 */

import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Colors, Typography, Layout } from "@/constants/tokens";
import {
  BUSINESS_NETWORKING_GOALS,
  BUSINESS_ROLE_TYPES,
  BUSINESS_INDUSTRIES,
  LANGUAGE_OPTIONS,
  SKILLS_POPULAR_BUSINESS,
} from "@/constants/profileOptions";
import {
  getBusinessFilters,
  setBusinessFilters,
  type BusinessFiltersState,
} from "@/lib/filters/businessFiltersStorage";
import { trackBusinessFilterApplied } from "@/lib/analytics/businessEvents";

export type BusinessSheetFilters = BusinessFiltersState & {
  networkingIntent?: string | null;
  maxDistanceKm?: number | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onApplied: (filters: BusinessSheetFilters) => void;
};

const LOCATION_OPTIONS = [
  { label: "Same city", km: 25 },
  { label: "Within 50 km", km: 50 },
  { label: "Within 200 km", km: 200 },
  { label: "Anywhere", km: null as number | null },
];

export function BusinessFilterSheet({ visible, onClose, onApplied }: Props) {
  const [intent, setIntent] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

  useEffect(() => {
    if (!visible) return;
    getBusinessFilters().then((f) => {
      setRoles(f.roles);
      setIndustries(f.industries);
      setLanguages(f.languages);
      setSkills(f.interests.slice(0, 5));
      setDistanceKm(f.distanceKm === 50 ? 50 : f.distanceKm);
      setIntent(f.networkingGoals[0] ?? null);
    });
  }, [visible]);

  const toggle = (arr: string[], val: string, set: (v: string[]) => void, max: number) => {
    Haptics.selectionAsync();
    if (arr.includes(val)) set(arr.filter((x) => x !== val));
    else if (arr.length < max) set([...arr, val]);
  };

  const addSkill = (s: string) => {
    const t = s.trim();
    if (!t || skills.includes(t) || skills.length >= 5) return;
    setSkills([...skills, t]);
    setSkillInput("");
  };

  const appliedCount =
    (intent ? 1 : 0) +
    roles.length +
    industries.length +
    skills.length +
    (languages.length && !languages.includes("Any") ? languages.length : 0) +
    (distanceKm != null && distanceKm !== 200 ? 1 : 0);

  const handleApply = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const current = await getBusinessFilters();
    const next: BusinessSheetFilters = {
      ...current,
      roles,
      industries,
      languages,
      interests: skills,
      networkingGoals: intent ? [intent] : [],
      distanceKm: distanceKm ?? 200,
      networkingIntent: intent,
      maxDistanceKm: distanceKm,
    };
    await setBusinessFilters(next);
    trackBusinessFilterApplied({
      has_text_query: !!current.searchQuery.trim(),
      intent,
      role_types_count: roles.length,
      industries_count: industries.length,
      skills_count: skills.length,
    });
    onApplied(next);
    onClose();
  };

  const handleReset = async () => {
    setIntent(null);
    setRoles([]);
    setIndustries([]);
    setLanguages([]);
    setSkills([]);
    setDistanceKm(null);
    setSkillInput("");
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>Filters</Text>
          <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Networking intent</Text>
            <View style={styles.chipWrap}>
              <Chip label="Any" active={!intent} onPress={() => setIntent(null)} />
              {BUSINESS_NETWORKING_GOALS.map((g) => (
                <Chip key={g} label={g} active={intent === g} onPress={() => setIntent(g)} />
              ))}
            </View>

            <Text style={styles.label}>Role / seniority</Text>
            <View style={styles.chipWrap}>
              {BUSINESS_ROLE_TYPES.slice(0, 12).map((r) => (
                <Chip
                  key={r}
                  label={r}
                  active={roles.includes(r)}
                  onPress={() => toggle(roles, r, setRoles, 6)}
                />
              ))}
            </View>

            <Text style={styles.label}>Industry</Text>
            <View style={styles.chipWrap}>
              {BUSINESS_INDUSTRIES.map((i) => (
                <Chip
                  key={i}
                  label={i}
                  active={industries.includes(i)}
                  onPress={() => toggle(industries, i, setIndustries, 5)}
                />
              ))}
            </View>

            <Text style={styles.label}>Location</Text>
            <View style={styles.chipWrap}>
              {LOCATION_OPTIONS.map((o) => (
                <Chip
                  key={o.label}
                  label={o.label}
                  active={distanceKm === o.km}
                  onPress={() => setDistanceKm(o.km)}
                />
              ))}
            </View>

            <Text style={styles.label}>Skills (up to 5)</Text>
            {skills.map((s) => (
              <Pressable key={s} onPress={() => setSkills(skills.filter((x) => x !== s))}>
                <Text style={styles.skillChip}>× {s}</Text>
              </Pressable>
            ))}
            <TextInput
              style={styles.input}
              value={skillInput}
              onChangeText={setSkillInput}
              placeholder="Type a skill…"
              onSubmitEditing={() => addSkill(skillInput)}
            />
            <View style={styles.chipWrap}>
              {SKILLS_POPULAR_BUSINESS.filter((s) =>
                s.toLowerCase().includes(skillInput.toLowerCase())
              ).map((s) => (
                <Chip key={s} label={s} active={false} onPress={() => addSkill(s)} />
              ))}
            </View>

            <Text style={styles.label}>Languages (max 3)</Text>
            <View style={styles.chipWrap}>
              {LANGUAGE_OPTIONS.filter((l) => l !== "Any").slice(0, 10).map((l) => (
                <Chip
                  key={l}
                  label={l}
                  active={languages.includes(l)}
                  onPress={() => toggle(languages, l, setLanguages, 3)}
                />
              ))}
            </View>
          </ScrollView>

          <Pressable style={styles.applyBtn} onPress={handleApply}>
            <Text style={styles.applyText}>Apply filters{appliedCount ? ` (${appliedCount})` : ""}</Text>
          </Pressable>
          <Pressable onPress={handleReset} style={styles.resetBtn}>
            <Text style={styles.resetText}>Reset</Text>
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
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "90%",
  },
  title: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 12 },
  label: { ...Typography.caption, color: Colors.gray600, marginTop: 12, marginBottom: 8, fontWeight: "700" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  chipActive: {
    backgroundColor: Colors.business.secondary,
    borderColor: Colors.business.primary,
  },
  chipText: { fontSize: 12, color: Colors.gray700 },
  chipTextActive: { color: Colors.business.primary, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Layout.radii.control,
    padding: 10,
    marginTop: 8,
    fontSize: 15,
  },
  skillChip: { fontSize: 13, color: Colors.business.primary, marginVertical: 4 },
  applyBtn: {
    marginTop: 16,
    backgroundColor: Colors.business.primary,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
  },
  applyText: { color: Colors.white, fontWeight: "700" },
  resetBtn: { marginTop: 10, alignItems: "center" },
  resetText: { color: Colors.gray600, fontWeight: "600" },
});
