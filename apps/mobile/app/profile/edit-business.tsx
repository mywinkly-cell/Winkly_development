// apps/mobile/app/profile/edit-business.tsx
// Winkly – Profile: Edit Business. Personal → profiles_mode (business). Business account → profiles_business.

import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/providers";
import {
  getOwnProfileMode,
  upsertOwnProfileMode,
  getOwnProfileBusiness,
  upsertOwnProfileBusiness,
} from "@/lib/access/profiles";
import { Card, Chip, Header, Input, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { FeatureRouteGate } from "@/components/routing/FeatureRouteGate";
import { canAccessBusinessRoutes } from "@/lib/modes/availability";
import type { BusinessProfileType } from "@/types";
import { BUSINESS_ORG_SUBTYPE_OPTIONS, normalizeBusinessType } from "@/lib/business/businessTypes";

/** Chip labels: i18n keys profile.edit.business.type.<value>. */
const BUSINESS_TYPE_OPTIONS: BusinessProfileType[] = [
  "individual_professional",
  ...BUSINESS_ORG_SUBTYPE_OPTIONS.map((o) => o.value),
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

/** Business sub-profile / business-account editor; parked while neither side is live. */
export default function EditBusinessRoute() {
  const { accountType } = useAuth();
  return (
    <FeatureRouteGate allowed={canAccessBusinessRoutes(accountType)}>
      <EditBusiness />
    </FeatureRouteGate>
  );
}

function EditBusiness() {
  const { t } = useTranslation();
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
        Alert.alert(t("common.error"), t("profile.edit.saveFailed"));
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
        Alert.alert(t("common.error"), t("profile.edit.saveFailed"));
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
        title={t("profile.edit.business.title")}
        onBack={() => router.back()}
        trailing={<TextButton title={saving ? t("profile.edit.saving") : t("common.save")} onPress={save} disabled={saving} style={styles.saveBtn} />}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Text style={styles.title}>{t("modes.business")}</Text>
          <Text style={styles.subtitle}>{t("profile.edit.business.subtitle")}</Text>

          {!isBusinessAccount && (
            <Input
              label={t("profile.edit.business.role")}
              value={role}
              onChangeText={setRole}
              placeholder={t("profile.edit.business.rolePlaceholder")}
              editable={!saving}
            />
          )}

          {isBusinessAccount ? (
            <>
              <Text style={styles.label}>{t("profile.edit.business.profileType")}</Text>
              <View style={styles.typeRow}>
                {BUSINESS_TYPE_OPTIONS.map((value) => (
                  <Chip
                    key={value}
                    label={t(`profile.edit.business.type.${value}`)}
                    selected={businessType === value}
                    onPress={() => setBusinessType(value)}
                    disabled={saving}
                  />
                ))}
              </View>
            </>
          ) : null}

          <Input
            label={isBusinessAccount ? t("profile.edit.business.businessName") : t("profile.edit.business.company")}
            value={company}
            onChangeText={setCompany}
            placeholder={t("profile.edit.business.companyPlaceholder")}
            editable={!saving}
          />
          <Input
            label={t("profile.edit.business.networkingGoal")}
            value={networkingGoal}
            onChangeText={setNetworkingGoal}
            placeholder={t("profile.edit.business.networkingGoalPlaceholder")}
            style={{ minHeight: 90, textAlignVertical: "top" }}
            multiline
            editable={!saving}
          />
          <Input
            label={t("profile.edit.business.skills")}
            value={skills}
            onChangeText={setSkills}
            placeholder={t("profile.edit.business.skillsPlaceholder")}
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
