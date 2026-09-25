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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { createGroupWithInvites } from "@/lib/groupInvitations";
import { getPartnersForConcierge } from "@/lib/ai/conciergePartners";
import type { ConciergePartner } from "@/lib/ai/conciergePartners";
import type { Mode } from "@/types";

type Styles = ReturnType<typeof createStyles>;

/** Group types; labels come from `modes.<key>`. */
const MODES: Mode[] = ["friends", "business"];

export default function CreateGroup() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { mode: modeParam, preselect } = useLocalSearchParams<{ mode?: Mode; preselect?: string }>();
  const preselectIds = React.useMemo(
    () => (typeof preselect === "string" ? preselect.split(",").map((s) => s.trim()).filter(Boolean) : []),
    [preselect]
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<Mode>((modeParam as Mode) ?? "friends");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(preselectIds));
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
        // Drop stale selections from a previous mode, but keep any preselected match.
        list.forEach((p) => {
          if (!preselectIds.includes(p.id)) next.delete(p.id);
        });
        return next;
      });
    } catch {
      setPartners([]);
    } finally {
      setLoadingPartners(false);
    }
  }, [mode, preselectIds]);

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
      Alert.alert(t("groups.form.missingName"), t("groups.create.missingNameBody"));
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
        t("groups.create.createdTitle"),
        selectedIds.size > 0
          ? t("groups.create.invitationsSent", { count: selectedIds.size })
          : t("groups.create.inviteLater"),
        [
          {
            text: t("groups.create.details"),
            onPress: () =>
              router.replace({
                pathname: "/groups/group-details",
                params: { id: groupId, name: name.trim() },
              }),
          },
          {
            text: t("groups.create.openChat"),
            onPress: () =>
              router.replace({ pathname: "/groups/group-chat", params: { groupId } }),
          },
        ]
      );
    } catch (e) {
      Alert.alert(t("common.error"), (e as Error).message ?? t("groups.create.failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Header title={t("groups.createGroup")} onBack={() => router.back()} theme={theme} styles={styles} />

        <View style={styles.card}>
          <Text style={styles.title}>{t("groups.create.title")}</Text>
          <Text style={styles.subtitle}>
            {t("groups.create.subtitle")}
          </Text>

          <Label text={t("groups.form.name")} styles={styles} />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t("groups.create.namePlaceholder")}
            placeholderTextColor={theme.colors.textMuted}
            style={styles.input}
          />

          <Label text={t("groups.create.type")} styles={styles} />
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

          <Label text={t("groups.form.description")} styles={styles} />
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={t("groups.create.descriptionPlaceholder")}
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
            multiline
          />

          <Label text={t("groups.create.invitePeople")} styles={styles} />
          <Text style={styles.hint}>{t("groups.create.inviteHint")}</Text>
          {loadingPartners ? (
            <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 12 }} />
          ) : partners.length === 0 ? (
            <Text style={styles.emptyHint}>{t("groups.create.noConnections")}</Text>
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
                    {selectedIds.has(p.id) ? <Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} /> : null}
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
              <ActivityIndicator size="small" color={theme.colors.onPrimary} />
            ) : (
              <Text style={styles.primaryText}>{t("groups.create.submit")}</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.back()} style={styles.secondaryBtn} activeOpacity={0.9}>
            <Text style={styles.secondaryText}>{t("common.cancel")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function Header({ title, onBack, theme, styles }: { title: string; onBack: () => void; theme: AppTheme; styles: Styles }) {
  const { t } = useTranslation();
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel={t("common.back")}>
        <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 70 }} />
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
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
    },
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
    modeRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
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
    hint: { ...theme.type.caption, color: theme.colors.textSecondary, marginBottom: 8 },
    emptyHint: { ...theme.type.caption, color: theme.colors.textMuted, marginBottom: 12, fontStyle: "italic" },
    partnerList: { marginBottom: 16, maxHeight: 220 },
    partnerRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: theme.colors.backgroundMuted,
      marginBottom: 6,
    },
    partnerRowSelected: { backgroundColor: theme.colors.primary + "18", borderWidth: 1, borderColor: theme.colors.primary + "40" },
    partnerAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: theme.colors.primary + "30",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
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
    primaryBtn: {
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 4,
    },
    primaryBtnDisabled: { opacity: 0.7 },
    primaryText: { ...theme.type.button, color: theme.colors.onPrimary },
    secondaryBtn: {
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.md,
      paddingVertical: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginTop: 10,
    },
    secondaryText: { ...theme.type.button, color: theme.colors.textPrimary },
  });
}
