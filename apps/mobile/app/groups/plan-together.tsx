/**
 * "Plan something for us" — pick 2–3 people and get AI group plan options without
 * manually creating a group or opening a chat first. Behind the scenes this
 * creates/ensures the group conversation and runs the same group planning path
 * StrategicHost uses, then drops the user onto the plan_options selection.
 *
 * Entry points: app/groups/index.tsx and app/(modes)/friends/index.tsx.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { getPartnersForConcierge, type ConciergePartner } from "@/lib/ai/conciergePartners";
import {
  planTogetherForPeople,
  MAX_PLAN_TOGETHER_GROUP_SIZE,
  type PlanTogetherMode,
} from "@/lib/groups/groupPlanTogether";

/** Plan modes; labels come from `modes.<key>`. */
const MODES: PlanTogetherMode[] = ["friends", "business"];

/** Max OTHER people (group includes the requester). */
const MAX_OTHERS = MAX_PLAN_TOGETHER_GROUP_SIZE - 1;

export default function PlanTogether() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const initialMode: PlanTogetherMode = modeParam === "business" ? "business" : "friends";

  const [mode, setMode] = useState<PlanTogetherMode>(initialMode);
  const [partners, setPartners] = useState<ConciergePartner[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadPartners = useCallback(async () => {
    setLoadingPartners(true);
    try {
      const list = await getPartnersForConcierge(mode);
      setPartners(list);
      // Drop selections that no longer exist in this mode's list.
      setSelectedIds((prev) => {
        const valid = new Set(list.map((p) => p.id));
        const next = new Set<string>();
        prev.forEach((id) => {
          if (valid.has(id)) next.add(id);
        });
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
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_OTHERS) {
          Alert.alert(t("groups.planTogether.plentyTitle"), t("groups.planTogether.plentyBody", { count: MAX_OTHERS }));
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const onGenerate = async () => {
    if (selectedIds.size < 1 || generating) return;
    setGenerating(true);
    try {
      const { conversationId } = await planTogetherForPeople({
        mode,
        inviteeUserIds: [...selectedIds],
      });
      // Land directly on the plan_options selection in the group chat. replace()
      // so Back returns to Groups, not this picker.
      router.replace({ pathname: "/chats/[conversationId]", params: { conversationId } });
    } catch (e) {
      Alert.alert(t("groups.planTogether.draftFailed"), (e as Error)?.message ?? t("common.tryAgain"));
      setGenerating(false);
    }
  };

  const count = selectedIds.size;

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel={t("common.back")}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("chat.view.planTogether")}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.title}>{t("groups.index.planTitle")}</Text>
          <Text style={styles.subtitle}>
            {t("groups.planTogether.subtitle")}
          </Text>

          <View style={styles.modeRow}>
            {MODES.map((m) => (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                style={[styles.modeChip, mode === m && styles.modeChipActive]}
                activeOpacity={0.8}
              >
                <Text style={[styles.modeChipText, mode === m && styles.modeChipTextActive]}>{t(`modes.${m}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>
            {count > 0
              ? t("groups.planTogether.whoIsInCount", { count, max: MAX_OTHERS })
              : t("groups.planTogether.whoIsIn")}
          </Text>
          <Text style={styles.hint}>{t("groups.planTogether.pickHint", { max: MAX_OTHERS })}</Text>

          {loadingPartners ? (
            <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 16 }} />
          ) : partners.length === 0 ? (
            <Text style={styles.emptyHint}>
              {t("groups.planTogether.empty")}
            </Text>
          ) : (
            <View style={styles.partnerList}>
              {partners.map((p) => {
                const selected = selectedIds.has(p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => togglePartner(p.id)}
                    style={[styles.partnerRow, selected && styles.partnerRowSelected]}
                  >
                    <View style={styles.partnerAvatar}>
                      {p.avatar_url ? (
                        <Image source={{ uri: p.avatar_url }} style={styles.partnerAvatarImg} />
                      ) : (
                        <Text style={styles.partnerAvatarText}>{p.displayName.slice(0, 1).toUpperCase()}</Text>
                      )}
                    </View>
                    <Text style={styles.partnerName} numberOfLines={1}>{p.displayName}</Text>
                    <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                      {selected ? <Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={onGenerate}
          style={[styles.primaryBtn, (count < 1 || generating) && styles.primaryBtnDisabled]}
          activeOpacity={0.9}
          disabled={count < 1 || generating}
        >
          {generating ? (
            <ActivityIndicator size="small" color={theme.colors.onPrimary} />
          ) : (
            <Text style={styles.primaryText}>
              {count > 1 ? t("groups.planTogether.getOptionsFor", { count: count + 1 }) : t("groups.planTogether.getOptions")}
            </Text>
          )}
        </TouchableOpacity>
        {generating ? (
          <Text style={styles.generatingHint}>{t("groups.planTogether.generating")}</Text>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.md,
      minHeight: 56,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { ...theme.type.h2, color: theme.colors.textPrimary },
    scroll: { padding: 20, paddingBottom: 24 },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
    },
    title: { ...theme.type.h2, color: theme.colors.textPrimary, marginBottom: 6 },
    subtitle: { ...theme.type.body, color: theme.colors.textSecondary, marginBottom: 16 },
    modeRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
    modeChip: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    modeChipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + "18" },
    modeChipText: { ...theme.type.body, color: theme.colors.textSecondary },
    modeChipTextActive: { color: theme.colors.primary, fontWeight: "600" },
    label: { ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: 4, fontWeight: "700" },
    hint: { ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: 10 },
    emptyHint: { ...theme.type.caption, color: theme.colors.textMuted, marginVertical: 12, fontStyle: "italic" },
    partnerList: { marginTop: 2 },
    partnerRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: theme.colors.backgroundMuted,
      marginBottom: 6,
    },
    partnerRowSelected: {
      backgroundColor: theme.colors.primary + "18",
      borderWidth: 1,
      borderColor: theme.colors.primary + "40",
    },
    partnerAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.colors.primary + "30",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      overflow: "hidden",
    },
    partnerAvatarImg: { width: 36, height: 36 },
    partnerAvatarText: { ...theme.type.caption, fontWeight: "700", color: theme.colors.primary },
    partnerName: { flex: 1, ...theme.type.body, color: theme.colors.textPrimary },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: theme.colors.textMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxChecked: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 28,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    primaryBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      paddingVertical: 14,
      alignItems: "center",
    },
    primaryBtnDisabled: { opacity: 0.5 },
    primaryText: { ...theme.type.button, color: theme.colors.onPrimary },
    generatingHint: { ...theme.type.caption, color: theme.colors.textSecondary, textAlign: "center", marginTop: 8 },
  });
}
