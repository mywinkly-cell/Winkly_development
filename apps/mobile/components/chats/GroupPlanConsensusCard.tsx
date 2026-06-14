import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { Colors, Typography } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import {
  confirmPendingPlan,
  getPendingPlanReactions,
  setPendingPlanReaction,
  type PendingPlanReaction,
  type PendingPlanReactionState,
} from "@/lib/ai/conciergeClient";

type PlanOption = {
  option_id?: string;
  character_label?: string;
  title?: string;
  why_this_fits?: string;
  group_fit_notes?: string[];
  venue?: { name?: string; address?: string };
};

const REACTIONS: { key: PendingPlanReaction; emoji: string }[] = [
  { key: "up", emoji: "👍" },
  { key: "maybe", emoji: "🤔" },
  { key: "down", emoji: "👎" },
];

/**
 * Consensus card for GROUP pending plans (TB-2.6).
 * Every member reacts 👍/🤔/👎 per A/B option; the host (plan creator) locks in an
 * option once it has more 👍 than 👎. Counts update live via Realtime.
 */
export function GroupPlanConsensusCard({
  pendingPlanId,
  options,
  isHost,
  hostName,
}: {
  pendingPlanId: string;
  options: PlanOption[];
  isHost: boolean;
  hostName?: string;
}) {
  const [state, setState] = useState<PendingPlanReactionState>({ counts: {}, mine: {} });
  const [status, setStatus] = useState<"open" | "confirming" | "confirmed">("open");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setState(await getPendingPlanReactions(pendingPlanId));
    } catch {
      // best-effort
    } finally {
      setLoading(false);
    }
  }, [pendingPlanId]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel(`ppr:${pendingPlanId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pending_plan_reactions", filter: `pending_plan_id=eq.${pendingPlanId}` },
        () => void refresh()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pendingPlanId, refresh]);

  const react = async (optionId: string, reaction: PendingPlanReaction) => {
    // optimistic
    setState((prev) => {
      const counts = { ...prev.counts };
      const mine = { ...prev.mine };
      const c = { up: 0, maybe: 0, down: 0, ...(counts[optionId] ?? {}) };
      const prevMine = mine[optionId];
      if (prevMine && prevMine !== reaction) c[prevMine] = Math.max(0, c[prevMine] - 1);
      if (prevMine !== reaction) c[reaction] += 1;
      counts[optionId] = c;
      mine[optionId] = reaction;
      return { counts, mine };
    });
    try {
      await setPendingPlanReaction(pendingPlanId, optionId as "A" | "B", reaction);
    } catch {
      void refresh();
    }
  };

  const confirmOption = async (optionId: string) => {
    setStatus("confirming");
    try {
      const r = await confirmPendingPlan(pendingPlanId, { asHost: true, optionId: optionId as "A" | "B" });
      setStatus(r.all_participants_confirmed || r.planner_item_id ? "confirmed" : "open");
    } catch (e) {
      setStatus("open");
      Alert.alert("Couldn't confirm", (e as Error)?.message ?? "Please try again.");
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>Group plan — vote & confirm</Text>

      {options.slice(0, 2).map((opt, idx) => {
        const optionId = (opt.option_id ?? (idx === 0 ? "A" : "B")).toUpperCase();
        const counts = state.counts[optionId] ?? { up: 0, maybe: 0, down: 0 };
        const mine = state.mine[optionId];
        const hasConsensus = counts.up > counts.down;
        return (
          <View key={optionId} style={styles.option}>
            <Text style={styles.optionLabel}>
              Option {optionId}
              {opt.character_label ? ` · ${opt.character_label}` : ""}
            </Text>
            <Text style={styles.optionTitle} numberOfLines={2}>
              {opt.title ?? "Plan"}
            </Text>
            {opt.venue?.name ? <Text style={styles.optionVenue} numberOfLines={1}>{opt.venue.name}</Text> : null}

            {Array.isArray(opt.group_fit_notes) && opt.group_fit_notes.length > 0 ? (
              <View style={styles.fitNotes}>
                {opt.group_fit_notes.slice(0, 4).map((note, i) => (
                  <View key={i} style={styles.fitNoteRow}>
                    <Ionicons name="checkmark" size={13} color={Colors.successGreen} style={{ marginTop: 1 }} />
                    <Text style={styles.fitNoteText}>{note}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.reactionRow}>
              {REACTIONS.map((r) => {
                const active = mine === r.key;
                const n = counts[r.key];
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => void react(optionId, r.key)}
                    disabled={status === "confirmed"}
                    style={[styles.reactionChip, active && styles.reactionChipActive]}
                  >
                    <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                    {n > 0 ? <Text style={[styles.reactionCount, active && styles.reactionCountActive]}>{n}</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            {isHost && status !== "confirmed" ? (
              <Pressable
                onPress={() => void confirmOption(optionId)}
                disabled={!hasConsensus || status === "confirming"}
                style={[styles.confirmBtn, (!hasConsensus || status === "confirming") && styles.confirmBtnDisabled]}
              >
                <Text style={styles.confirmText}>
                  {status === "confirming" ? "Confirming…" : hasConsensus ? `Confirm Option ${optionId}` : "Needs more 👍"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {loading ? <ActivityIndicator size="small" color={Colors.primaryViolet} style={{ marginTop: 6 }} /> : null}

      {status === "confirmed" ? (
        <View style={styles.confirmedRow}>
          <Ionicons name="checkmark-circle" size={16} color={Colors.successGreen} />
          <Text style={styles.confirmedText}>Locked in — saved to everyone&apos;s Planner.</Text>
        </View>
      ) : !isHost ? (
        <Text style={styles.waitingText}>
          {`Waiting for ${hostName ?? "the host"} to confirm.`}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.primaryViolet + "55",
    backgroundColor: Colors.primaryViolet + "0A",
    minWidth: 260,
  },
  kicker: { fontSize: 12, fontWeight: "800", color: Colors.primaryViolet, marginBottom: 8 },
  option: { borderTopWidth: 1, borderTopColor: Colors.primaryViolet + "22", paddingTop: 10, marginTop: 6 },
  optionLabel: { fontSize: 11, fontWeight: "700", color: Colors.gray600, textTransform: "uppercase" },
  optionTitle: { fontWeight: "700", fontSize: 15, color: Colors.textPrimary, marginTop: 2 },
  optionVenue: { fontSize: 13, color: Colors.gray600, marginTop: 2 },

  fitNotes: { marginTop: 8, gap: 4 },
  fitNoteRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  fitNoteText: { flex: 1, fontSize: 12, color: Colors.gray700, lineHeight: 16 },

  reactionRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  reactionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.gray300,
    backgroundColor: Colors.white,
  },
  reactionChipActive: { borderColor: Colors.primaryViolet, backgroundColor: Colors.primaryViolet + "18" },
  reactionEmoji: { fontSize: 15 },
  reactionCount: { fontSize: 12, fontWeight: "700", color: Colors.gray700 },
  reactionCountActive: { color: Colors.primaryViolet },

  confirmBtn: {
    marginTop: 10,
    paddingVertical: 9,
    alignItems: "center",
    backgroundColor: Colors.primaryViolet,
    borderRadius: 10,
  },
  confirmBtnDisabled: { backgroundColor: Colors.gray300 },
  confirmText: { fontSize: 13, fontWeight: "700", color: Colors.white },

  confirmedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  confirmedText: { fontSize: 12, color: Colors.successGreen },
  waitingText: { fontSize: 12, color: Colors.gray600, marginTop: 12, textAlign: "center" },
});
