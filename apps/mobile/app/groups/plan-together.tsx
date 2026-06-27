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
import { Colors, Typography, Layout } from "@/constants/tokens";
import { getPartnersForConcierge, type ConciergePartner } from "@/lib/ai/conciergePartners";
import {
  planTogetherForPeople,
  MAX_PLAN_TOGETHER_GROUP_SIZE,
  type PlanTogetherMode,
} from "@/lib/groups/groupPlanTogether";

const MODES: { key: PlanTogetherMode; label: string }[] = [
  { key: "friends", label: "Friends" },
  { key: "business", label: "Business" },
];

/** Max OTHER people (group includes the requester). */
const MAX_OTHERS = MAX_PLAN_TOGETHER_GROUP_SIZE - 1;

export default function PlanTogether() {
  const router = useRouter();
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
          Alert.alert("That's plenty", `You can plan with up to ${MAX_OTHERS} people at once.`);
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
      Alert.alert("Couldn't draft a plan", (e as Error)?.message ?? "Please try again.");
      setGenerating(false);
    }
  };

  const count = selectedIds.size;

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.9} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Plan together</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.title}>Plan something for us</Text>
          <Text style={styles.subtitle}>
            Pick a few people and Winkly drafts plan options for the group — no need to set up a
            chat first. Everyone can vote, and you lock in the favorite.
          </Text>

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

          <Text style={styles.label}>
            {`Who's in?${count > 0 ? ` · ${count}/${MAX_OTHERS}` : ""}`}
          </Text>
          <Text style={styles.hint}>Pick 1–{MAX_OTHERS} people to plan with.</Text>

          {loadingPartners ? (
            <ActivityIndicator size="small" color={Colors.primaryViolet} style={{ marginVertical: 16 }} />
          ) : partners.length === 0 ? (
            <Text style={styles.emptyHint}>
              No connections yet in this mode. Connect with people first, then come back to plan together.
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
                      {selected ? <Ionicons name="checkmark" size={18} color="#FFF" /> : null}
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
            <ActivityIndicator size="small" color={Colors.accentYellow} />
          ) : (
            <Text style={styles.primaryText}>
              {count > 1 ? `Get plan options for ${count + 1} of us` : "Get plan options"}
            </Text>
          )}
        </TouchableOpacity>
        {generating ? (
          <Text style={styles.generatingHint}>Drafting plans everyone will like…</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    ...Layout.topHeaderBar,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { ...Typography.headerTitle, color: Colors.textPrimary },
  scroll: { padding: 20, paddingBottom: 24 },
  card: {
    backgroundColor: "#FFF",
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 16,
  },
  title: { ...Typography.h2, color: Colors.textPrimary, marginBottom: 6 },
  subtitle: { ...Typography.body, color: Colors.gray700, marginBottom: 16 },
  modeRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
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
  label: { ...Typography.caption, color: Colors.gray600, marginBottom: 4, fontWeight: "700" },
  hint: { ...Typography.caption, color: Colors.gray600, marginBottom: 10 },
  emptyHint: { ...Typography.caption, color: Colors.gray500, marginVertical: 12, fontStyle: "italic" },
  partnerList: { marginTop: 2 },
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: Colors.gray100,
    marginBottom: 6,
  },
  partnerRowSelected: {
    backgroundColor: Colors.primaryViolet + "18",
    borderWidth: 1,
    borderColor: Colors.primaryViolet + "40",
  },
  partnerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryViolet + "30",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    overflow: "hidden",
  },
  partnerAvatarImg: { width: 36, height: 36 },
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
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
    backgroundColor: "#FFF",
  },
  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryText: { ...Typography.button, color: Colors.accentYellow },
  generatingHint: { ...Typography.caption, color: Colors.gray600, textAlign: "center", marginTop: 8 },
});
