// apps/mobile/app/profile/edit-business.tsx
// Winkly – Profile: Edit Business. Personal → profiles_mode (business). Business account → profiles_business.

import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers";
import {
  getOwnProfileMode,
  upsertOwnProfileMode,
  getOwnProfileBusiness,
  upsertOwnProfileBusiness,
} from "@/lib/access/profiles";
import { Colors, Typography, Layout } from "@/constants/tokens";
import type { BusinessProfileType } from "@/types";
import { BUSINESS_ORG_SUBTYPE_OPTIONS, normalizeBusinessType } from "@/lib/business/businessTypes";

const BUSINESS_TYPE_OPTIONS: Array<{ value: BusinessProfileType; label: string }> = [
  { value: "individual_professional", label: "Individual professional" },
  ...BUSINESS_ORG_SUBTYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
];

function toTagsArray(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function fromTagsArray(arr: string[] | null | undefined): string {
  return arr?.join(", ") ?? "";
}

function fromMetaTags(value: unknown): string {
  if (Array.isArray(value)) {
    return fromTagsArray(value.filter((x): x is string => typeof x === "string"));
  }
  if (typeof value === "string") return value;
  return "";
}

export default function EditBusiness() {
  const router = useRouter();
  const { user, accountType } = useAuth();
  const isBusinessAccount = accountType === "business";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [networkingGoal, setNetworkingGoal] = useState("");
  const [skills, setSkills] = useState("");
  const [businessType, setBusinessType] = useState<BusinessProfileType>("brand");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      if (isBusinessAccount) {
        const profile = await getOwnProfileBusiness(user.id);
        if (cancelled) return;
        setCompany(profile?.business_name ?? "");
        setNetworkingGoal(profile?.bio ?? "");
        setSkills(fromTagsArray(profile?.tags ?? undefined));
        setBusinessType(normalizeBusinessType(profile?.business_type));
        setRole("");
          } else {
        const profile = await getOwnProfileMode(user.id, "business");
        if (cancelled) return;
        const meta = (profile?.meta as Record<string, unknown>) ?? {};
        setRole((meta.role as string) ?? "");
        setCompany((meta.company as string) ?? "");
        setNetworkingGoal((meta.networking_goal as string) ?? "");
        setSkills(fromMetaTags(meta.skills));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id, isBusinessAccount]);

  const save = async () => {
    if (!user?.id) return;
    setSaving(true);
    if (isBusinessAccount) {
      const { error } = await upsertOwnProfileBusiness(user.id, {
        business_name: company.trim() || "My Business",
        business_type: businessType,
        bio: networkingGoal.trim() || null,
        tags: toTagsArray(skills).length ? toTagsArray(skills) : null,
      });
      setSaving(false);
      if (error) {
        Alert.alert("Error", "Could not save profile. Please try again.");
        return;
      }
    } else {
      const { error } = await upsertOwnProfileMode(user.id, "business", {
        meta: {
          role: role.trim() || null,
          company: company.trim() || null,
          networking_goal: networkingGoal.trim() || null,
          skills: fromMetaTags(skills).trim() || null,
        },
      });
      setSaving(false);
      if (error) {
        Alert.alert("Error", "Could not save profile. Please try again.");
        return;
      }
    }
    router.back();
  };

  if (!user) return null;
  if (loading) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.primaryViolet} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Header title="Edit business" onBack={() => router.back()} onSave={save} saving={saving} />

        <View style={styles.card}>
          <Text style={styles.title}>Business</Text>
          <Text style={styles.subtitle}>Your professional identity for networking mode.</Text>

          {!isBusinessAccount && (
            <>
              <Label text="Role / Title" />
              <TextInput
                value={role}
                onChangeText={setRole}
                placeholder="e.g. IT Project Manager"
                placeholderTextColor={Colors.gray500}
                style={styles.input}
                editable={!saving}
              />
            </>
          )}

          {isBusinessAccount ? (
            <>
              <Label text="Profile type" />
              <View style={styles.typeRow}>
                {BUSINESS_TYPE_OPTIONS.map((opt) => {
                  const selected = businessType === opt.value;
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setBusinessType(opt.value)}
                      style={[styles.typeChip, selected && styles.typeChipSelected]}
                      activeOpacity={0.9}
                      disabled={saving}
                    >
                      <Text style={[styles.typeChipText, selected && styles.typeChipTextSelected]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}

          <Label text={isBusinessAccount ? "Business name" : "Company (optional)"} />
          <TextInput
            value={company}
            onChangeText={setCompany}
            placeholder="e.g. Winkly Technologies"
            placeholderTextColor={Colors.gray500}
            style={styles.input}
            editable={!saving}
          />

          <Label text="Networking goal" />
          <TextInput
            value={networkingGoal}
            onChangeText={setNetworkingGoal}
            placeholder="e.g. partnerships, hiring, mentorship..."
            placeholderTextColor={Colors.gray500}
            style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
            multiline
            editable={!saving}
          />

          <Label text="Skills / Focus (optional)" />
          <TextInput
            value={skills}
            onChangeText={setSkills}
            placeholder="e.g. PM, agile, analytics, automation..."
            placeholderTextColor={Colors.gray500}
            style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
            multiline
            editable={!saving}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function Header({
  title,
  onBack,
  onSave,
  saving,
}: { title: string; onBack: () => void; onSave: () => void; saving?: boolean }) {
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back" disabled={saving}>
        <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <TouchableOpacity onPress={onSave} style={[styles.saveBtn, saving && styles.saveBtnDisabled]} activeOpacity={0.9} disabled={saving}>
        <Text style={styles.saveText}>{saving ? "Saving…" : "Save"}</Text>
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
  saveBtnDisabled: { opacity: 0.7 },
  saveText: { ...Typography.caption, color: Colors.accentYellow },
  centered: { justifyContent: "center", alignItems: "center" },

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
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  typeChip: {
    borderWidth: 1,
    borderColor: Colors.gray300,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFF",
  },
  typeChipSelected: { borderColor: Colors.primaryViolet, backgroundColor: "#F5F1FF" },
  typeChipText: { ...Typography.caption, color: Colors.gray700 },
  typeChipTextSelected: { color: Colors.primaryViolet, fontWeight: "700" },
});
