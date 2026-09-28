// apps/mobile/components/wishlist/SharePeopleSheet.tsx
// Pick specific connections (people you chat with) who can see one saved place — or the
// whole wishlist. Complements "share with all my dates / friends / business contacts".

import React, { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, Image, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PrimaryButton, TextButton } from "@/components/ds";
import { useAppTheme } from "@/constants/design-system";
import { getWishlistViewers, listShareCandidates, setWishlistViewers, type ShareCandidate } from "@/lib/wishlistStore";

type Props = {
  visible: boolean;
  /** The saved place, or null for the whole list. */
  itemId: string | null;
  onClose: (savedCount?: number) => void;
};

export function SharePeopleSheet({ visible, itemId, onClose }: Props) {
  const theme = useAppTheme();
  const { t } = useTranslation();
  const [people, setPeople] = useState<ShareCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void Promise.all([listShareCandidates(), getWishlistViewers(itemId)])
      .then(([list, viewers]) => {
        if (cancelled) return;
        setPeople(list);
        setSelected(new Set(viewers));
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, itemId]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people ?? []).filter((p) => !q || (p.firstName ?? "").toLowerCase().includes(q));
  }, [people, query]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      const n = await setWishlistViewers(itemId, Array.from(selected));
      onClose(n);
    } catch {
      Alert.alert(t("catalog.saveFailedTitle"), t("catalog.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => onClose()}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.colors.surface, borderTopLeftRadius: theme.radii.lg, borderTopRightRadius: theme.radii.lg }]}>
          <View style={styles.headRow}>
            <Text style={[theme.type.h3, { color: theme.colors.textPrimary, flex: 1 }]}>
              {itemId ? t("wishlist.peopleTitleItem") : t("wishlist.peopleTitleList")}
            </Text>
            <TextButton title={t("common.cancel")} onPress={() => onClose()} />
          </View>
          <Text style={[theme.type.caption, { color: theme.colors.textSecondary, marginBottom: theme.spacing.sm }]}>
            {t("wishlist.peopleHint")}
          </Text>
          <View style={[styles.search, { borderColor: theme.colors.border, borderRadius: theme.radii.md }]}>
            <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("wishlist.peopleSearch")}
              placeholderTextColor={theme.colors.textMuted}
              style={[theme.type.body, { flex: 1, color: theme.colors.textPrimary }]}
            />
          </View>
          {people === null ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: theme.spacing.xl }} />
          ) : people.length === 0 ? (
            <Text style={[theme.type.body, { color: theme.colors.textSecondary, marginVertical: theme.spacing.lg }]}>
              {t("wishlist.peopleEmpty")}
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {shown.map((p) => {
                const on = selected.has(p.userId);
                return (
                  <Pressable
                    key={p.userId}
                    onPress={() => toggle(p.userId)}
                    style={[styles.row, { borderBottomColor: theme.colors.border }]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={p.firstName ?? t("wishlist.peopleUnnamed")}
                  >
                    {p.photoUrl?.startsWith("https://") ? (
                      <Image source={{ uri: p.photoUrl }} style={styles.avatar} accessibilityIgnoresInvertColors />
                    ) : (
                      <View style={[styles.avatar, { backgroundColor: theme.colors.backgroundMuted, alignItems: "center", justifyContent: "center" }]}>
                        <Ionicons name="person" size={18} color={theme.colors.textMuted} />
                      </View>
                    )}
                    <Text style={[theme.type.body, { color: theme.colors.textPrimary, flex: 1 }]} numberOfLines={1}>
                      {p.firstName ?? t("wishlist.peopleUnnamed")}
                    </Text>
                    <Ionicons
                      name={on ? "checkbox" : "square-outline"}
                      size={22}
                      color={on ? theme.colors.primary : theme.colors.textMuted}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <PrimaryButton
            title={t("wishlist.peopleSave", { count: selected.size })}
            onPress={save}
            loading={saving}
            disabled={saving || people === null}
            style={{ marginTop: theme.spacing.md }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: { padding: 20, paddingBottom: 32 },
  headRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  avatar: { width: 36, height: 36, borderRadius: 18 },
});
