// apps/mobile/app/profile/edit-business.tsx
// Winkly – Profile: Edit Business. Personal → profiles_mode (business). Business account → profiles_business.

import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/providers";
import {
  getOwnProfileMode,
  upsertOwnProfileMode,
  getOwnProfileBusiness,
  upsertOwnProfileBusiness,
} from "@/lib/access/profiles";
import { Card, Chip, Header, Input, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
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
  const theme = useAppTheme();
  const styles = createStyles(theme);

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
      <View style={{ ...styles.screen, ...styles.centered }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Header
        title="Edit business"
        onBack={() => router.back()}
        trailing={<TextButton title={saving ? "Saving…" : "Save"} onPress={save} disabled={saving} style={styles.saveBtn} />}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.title}>Business</Text>
          <Text style={styles.subtitle}>Your professional identity for networking mode.</Text>

          {!isBusinessAccount && (
            <Input
              label="Role / Title"
              value={role}
              onChangeText={setRole}
              placeholder="e.g. IT Project Manager"
              editable={!saving}
            />
          )}

          {isBusinessAccount ? (
            <>
              <Text style={styles.label}>Profile type</Text>
              <View style={styles.typeRow}>
                {BUSINESS_TYPE_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    selected={businessType === opt.value}
                    onPress={() => setBusinessType(opt.value)}
                    disabled={saving}
                  />
                ))}
              </View>
            </>
          ) : null}

          <Input
            label={isBusinessAccount ? "Business name" : "Company (optional)"}
            value={company}
            onChangeText={setCompany}
            placeholder="e.g. Winkly Technologies"
            editable={!saving}
          />
          <Input
            label="Networking goal"
            value={networkingGoal}
            onChangeText={setNetworkingGoal}
            placeholder="e.g. partnerships, hiring, mentorship..."
            style={{ minHeight: 90, textAlignVertical: "top" }}
            multiline
            editable={!saving}
          />
          <Input
            label="Skills / Focus (optional)"
            value={skills}
            onChangeText={setSkills}
            placeholder="e.g. PM, agile, analytics, automation..."
            style={{ minHeight: 90, textAlignVertical: "top" }}
            multiline
            editable={!saving}
          />
        </Card>
      </ScrollView>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    centered: { justifyContent: "center", alignItems: "center" },
    scroll: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    saveBtn: { paddingHorizontal: 0 },
    card: {},
    title: { ...theme.type.h2, fontFamily: theme.type.h2.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.xxs },
    subtitle: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
    label: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xs,
    },
    typeRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  });
}
