/**
 * Last step before adding to planner: show chosen option summary,
 * conflict check, "Just this time" / "Repeat weekly", and "Add to planner".
 */

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Share,
} from "react-native";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography } from "@/constants/tokens";
import { callWinklyPlan, type ConciergeContext, type ExperienceOption, type WinklyPlanOption } from "@/lib/ai/conciergeClient";
import type { PlannerThemePlanOption, PlannerTripDay } from "@/lib/ai/strategicHost";
import type { Mode } from "@/types";
import { createPlannerItemForSelf, createPlannerInvite } from "@/lib/plannerInvitations";
import { requestDateSafetyPrompt } from "@/lib/safety/dateCheckinPrompt";
import { createDirectChat, sendMessage } from "@/lib/chats";
import { getPlannerItems } from "@/lib/access/planner";
import { supabase } from "@/lib/supabase";

type PlannerItemRow = { id: string; title: string; starts_at: string; ends_at: string | null };

function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string | null
): boolean {
  const aS = new Date(aStart).getTime();
  const aE = new Date(aEnd).getTime();
  const bS = new Date(bStart).getTime();
  const bE = bEnd ? new Date(bEnd).getTime() : Infinity;
  return aS < bE && aE > bS;
}

function parseTimeFromOption(option: ExperienceOption): { hour: number; minute: number } {
  const first =
    option.itinerary?.find((s) => (s as { time?: string }).time)?.time ??
    option.itinerary?.[0]?.time ??
    option.schedule?.[0];
  if (first) {
    const match = first.match(/(\d{1,2}):(\d{2})/);
    if (match) return { hour: parseInt(match[1], 10), minute: parseInt(match[2], 10) };
    const pm = /(\d{1,2})\s*:\s*(\d{2})?\s*PM/i.test(first) || /\b(\d{1,2})\s*PM/i.test(first);
    const am = /(\d{1,2})\s*:\s*(\d{2})?\s*AM/i.test(first) || /\b(\d{1,2})\s*AM/i.test(first);
    const hMatch = first.match(/(\d{1,2})/);
    if (hMatch) {
      let h = parseInt(hMatch[1], 10);
      if (pm && h < 12) h += 12;
      if (am && h === 12) h = 0;
      const m = first.match(/:(\d{2})/)?.[1];
      return { hour: h, minute: m ? parseInt(m, 10) : 0 };
    }
  }
  return { hour: 19, minute: 0 };
}

function buildStartsEnds(
  date: Date,
  option: ExperienceOption,
  exactTimeHm?: string
): { starts_at: string; ends_at: string } {
  const hm = typeof exactTimeHm === "string" && /^\d{2}:\d{2}$/.test(exactTimeHm) ? exactTimeHm : null;
  const { hour, minute } = hm
    ? { hour: parseInt(hm.slice(0, 2), 10), minute: parseInt(hm.slice(3, 5), 10) }
    : parseTimeFromOption(option);
  const start = new Date(date);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + 2, end.getMinutes(), 0, 0);
  return {
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
  };
}

export type ConciergeConfirmStepProps = {
  chosenOption?: ExperienceOption;
  /** When set, treat as structured plan option per plan_options template. */
  structuredPlan?: PlannerThemePlanOption;
  /** Selected partner for invite (optional). */
  partner: { id: string; displayName: string } | null;
  /** Date chosen in the form. */
  dateForPlan: Date;
  /** Normalized "City, Country" line from the form (for planner meta + sharing). */
  locationLineDisplay?: string;
  /** Optional exact HH:mm (local) chosen in Step 2. Overrides option parsing when present. */
  exactTimeHm?: string;
  mode: Mode;
  /** When inviting someone, pass the last planning context so the pending plan has location/budget/weather. */
  contextForPendingPlan?: ConciergeContext | null;
  onDone: () => void;
  onBack: () => void;
  /** When set, show "Correct Details" to refine (e.g. "Make it cheaper", "Earlier time"). Calls with refinement hint. */
  onCorrectDetails?: (refinementHint: string) => void;
  showInlineBack?: boolean;
};

const REFINEMENT_SUGGESTIONS = ["Make it cheaper", "Earlier time", "More relaxed", "Different cuisine"];

export function ConciergeConfirmStep({
  chosenOption,
  structuredPlan,
  partner,
  dateForPlan,
  locationLineDisplay,
  exactTimeHm,
  mode,
  contextForPendingPlan,
  onDone,
  onBack,
  onCorrectDetails,
  showInlineBack = true,
}: ConciergeConfirmStepProps) {
  const [saving, setSaving] = useState(false);
  const [inviteToo, setInviteToo] = useState(!!partner);
  const [error, setError] = useState<string | null>(null);
  const [refinementCustom, setRefinementCustom] = useState("");
  const [conflictingItems, setConflictingItems] = useState<PlannerItemRow[]>([]);
  const [conflictChecked, setConflictChecked] = useState(false);
  const [addRecurrence, setAddRecurrence] = useState<"once" | "weekly">("once");

  const title =
    structuredPlan?.title ||
    (chosenOption?.option_name as string) ||
    (chosenOption?.narrative as string) ||
    "Plan";
  const why =
    structuredPlan?.why_this_fits ||
    (chosenOption?.why_this_fits as string) ||
    (chosenOption?.logic_bridge as string) ||
    "";
  const tripDays: PlannerTripDay[] | undefined = structuredPlan?.trip_days;
  const structuredItinerary = Array.isArray(structuredPlan?.itinerary) ? structuredPlan!.itinerary : [];

  const schedule =
    tripDays?.length
      ? tripDays.flatMap((d) => [
          `Day ${d.day} · ${d.date}`,
          `Morning — ${d.morning.summary}`,
          `Afternoon — ${d.afternoon.summary}`,
          ...(d.evening ? [`Evening — ${d.evening.summary}`] : []),
        ])
      : structuredPlan
        ? structuredItinerary.length
          ? structuredItinerary.map((s) => `${s.time} ${s.description}`.trim())
          : []
        : chosenOption?.schedule ??
          chosenOption?.itinerary?.map((s) => `${(s as { time?: string }).time ?? ""} ${(s as { activity?: string }).activity ?? ""}`.trim()) ??
          [];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const meId = auth.user?.id;
      if (!meId) {
        setConflictChecked(true);
        return;
      }

      let ranges: { starts_at: string; ends_at: string }[];
      if (tripDays?.length) {
        ranges = tripDays.map((d) => {
          const start = new Date(`${d.date}T09:00:00`);
          const end = new Date(`${d.date}T21:00:00`);
          return { starts_at: start.toISOString(), ends_at: end.toISOString() };
        });
      } else if (structuredPlan) {
        const pseudo: ExperienceOption = {
          option_name: structuredPlan.title,
          itinerary: structuredItinerary.map((s) => ({ time: s.time, activity: s.description })),
        };
        ranges = [buildStartsEnds(dateForPlan, pseudo, exactTimeHm)];
      } else {
        ranges = [buildStartsEnds(dateForPlan, chosenOption as ExperienceOption, exactTimeHm)];
      }

      const items = await getPlannerItems(meId, undefined, 100);
      if (cancelled) return;
      const overlapping: PlannerItemRow[] = [];
      for (const r of ranges) {
        for (const it of items as PlannerItemRow[]) {
          if (overlaps(r.starts_at, r.ends_at, it.starts_at, it.ends_at)) {
            overlapping.push(it);
            break;
          }
        }
      }
      setConflictingItems(overlapping);
      setConflictChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [dateForPlan, chosenOption, structuredPlan, exactTimeHm]);

  const handleAddToPlanner = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError(null);
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const meId = auth.user?.id;
      if (!meId) throw new Error("Not signed in");

      let starts_at: string;
      let ends_at: string;
      if (structuredPlan?.trip_days?.length) {
        const first = structuredPlan.trip_days[0];
        const last = structuredPlan.trip_days[structuredPlan.trip_days.length - 1];
        const start = new Date(`${first.date}T09:00:00`);
        const end = new Date(`${last.date}T21:00:00`);
        starts_at = start.toISOString();
        ends_at = end.toISOString();
      } else if (structuredPlan) {
        const pseudo: ExperienceOption = {
          option_name: structuredPlan.title,
          itinerary: structuredItinerary.map((s) => ({ time: s.time, activity: s.description })),
        };
        const se = buildStartsEnds(dateForPlan, pseudo, exactTimeHm);
        starts_at = se.starts_at;
        ends_at = se.ends_at;
      } else {
        const se = buildStartsEnds(dateForPlan, chosenOption as ExperienceOption, exactTimeHm);
        starts_at = se.starts_at;
        ends_at = se.ends_at;
      }

      const activity = structuredPlan?.title || (chosenOption?.option_name as string) || title;
      const place = structuredPlan?.venue?.name
        ? structuredPlan.venue.name
        : (chosenOption as { place?: string })?.place ??
          (chosenOption as { venue_name?: string })?.venue_name ??
          (chosenOption?.option_name as string) ??
          (chosenOption?.narrative as string) ??
          undefined;
      const location = structuredPlan?.venue?.address
        ? structuredPlan.venue.address
        : locationLineDisplay?.trim()
          ? locationLineDisplay.trim()
          : undefined;
      const payload = {
        title,
        description: why || undefined,
        source_mode: mode,
        starts_at,
        ends_at,
        activity,
        location,
        place,
      };

      if (structuredPlan?.trip_days?.length) {
        const baseTitle = structuredPlan.title || title;
        for (const d of structuredPlan.trip_days) {
          const dayStart = new Date(`${d.date}T09:00:00`);
          const dayEnd = new Date(`${d.date}T21:00:00`);
          const description = [
            `Morning: ${d.morning.summary}`,
            `Afternoon: ${d.afternoon.summary}`,
            d.evening ? `Evening: ${d.evening.summary}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          await createPlannerItemForSelf(meId, {
            title: `${baseTitle} · Day ${d.day}`,
            description,
            source_mode: mode,
            starts_at: dayStart.toISOString(),
            ends_at: dayEnd.toISOString(),
            activity,
            location,
            place,
            item_meta: {
              concierge_trip: true,
              trip_day: d.day,
              trip_date: d.date,
              morning: d.morning,
              afternoon: d.afternoon,
              evening: d.evening ?? null,
              activity,
              location,
              place,
            },
          });
        }
        onDone();
        return;
      }

      if (inviteToo && partner) {
        const conversationId = await createDirectChat(partner.id, mode, "invite", meId);
        // New flow: create pending plan + require both to confirm before finalizing into Planner.
        const baseCtx = contextForPendingPlan ?? { mode };
        const planRes = await callWinklyPlan({
          context: {
            ...baseCtx,
            mode,
            date_from: starts_at,
            budget_amount: (baseCtx as { budget_amount?: number }).budget_amount,
            budget_currency: (baseCtx as { budget_currency?: string }).budget_currency,
            weather_snapshot: (baseCtx as ConciergeContext).weather_snapshot,
            participant_user_ids: [meId, partner.id],
            partner_user_id: partner.id,
            // Use the chosen option as the "idea" seed.
            user_prompt: String(structuredPlan?.title ?? chosenOption?.option_name ?? title ?? "Plan"),
            activity_hint: String(structuredPlan?.title ?? chosenOption?.option_name ?? title ?? "Plan"),
          },
        });

        const pendingPlanId = planRes.pending_plan_id;
        if (!pendingPlanId) {
          // Fallback to legacy planner invitation when plan storage isn't available yet.
          const { planner_item_id, planner_invitation_id } = await createPlannerInvite(
            meId,
            partner.id,
            conversationId,
            payload
          );
          const ctaPayload = JSON.stringify({
            type: "planner_invite",
            planner_item_id,
            planner_invitation_id,
            title,
            activity: payload.activity,
            location: payload.location ?? null,
            place: payload.place ?? null,
            starts_at,
            ends_at,
            source_mode: mode,
          });
          await sendMessage(conversationId, meId, ctaPayload, [], { messageType: "cta" });
        } else {
          const wp: WinklyPlanOption = planRes.options?.[1] ?? planRes.options?.[0];
          const ctaPayload = JSON.stringify({
            type: "pending_plan",
            pending_plan_id: pendingPlanId,
            source_mode: mode,
            topic: wp.title,
            date_time: starts_at,
            duration: wp.duration_minutes,
            location_details: { name: wp.venue.name, address: wp.venue.address, google_maps_link: wp.venue.google_maps_link },
            logic_reasoning: wp.why_this_fits,
          });
          await sendMessage(conversationId, meId, ctaPayload, [], { messageType: "cta" });
        }
      } else if (addRecurrence === "weekly") {
        const weeks = [0, 1, 2, 3];
        const recurrenceSeed = (chosenOption ??
          ({
            option_name: structuredPlan?.title ?? title,
            itinerary: structuredItinerary.length
              ? structuredItinerary.map((s) => ({ time: s.time, activity: s.description }))
              : [{ activity: title }],
          } as ExperienceOption));
        for (const weekOffset of weeks) {
          const startDate = new Date(dateForPlan);
          startDate.setDate(startDate.getDate() + weekOffset * 7);
          const { starts_at: s, ends_at: e } = buildStartsEnds(startDate, recurrenceSeed);
          await createPlannerItemForSelf(meId, {
            ...payload,
            starts_at: s,
            ends_at: e,
          });
        }
      } else {
        const itemId = await createPlannerItemForSelf(meId, payload);
        if (mode === "romance") {
          void requestDateSafetyPrompt({
            plannerItemId: itemId,
            partnerUserId: partner?.id ?? null,
            scheduledAt: starts_at,
          });
        }
      }
      onDone();
    } catch (e) {
      setError((e as Error).message ?? "Something went wrong.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      {showInlineBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={Colors.primaryViolet} />
          <Text style={styles.backText}>Back to options</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={styles.title}>{title}</Text>
      {why ? (
        <>
          <Text style={styles.whyLabel}>Why it fits your DNA</Text>
          <Text style={styles.why} numberOfLines={5}>{why}</Text>
        </>
      ) : null}
      {tripDays?.length ? (
        <View style={styles.tripTimeline}>
          {tripDays.map((d) => (
            <View key={`${d.day}-${d.date}`} style={styles.tripDayCard}>
              <Text style={styles.tripDayTitle}>
                Day {d.day} · {d.date}
              </Text>
              <Text style={styles.tripSlot}>Morning — {d.morning.summary}</Text>
              <Text style={styles.tripSlot}>Afternoon — {d.afternoon.summary}</Text>
              {d.evening ? <Text style={styles.tripSlot}>Evening — {d.evening.summary}</Text> : null}
            </View>
          ))}
        </View>
      ) : schedule.length > 0 ? (
        <View style={styles.scheduleBlock}>
          {schedule.map((line, i) => (
            <Text key={i} style={styles.scheduleLine}>{line}</Text>
          ))}
        </View>
      ) : null}

      <TouchableOpacity
        style={styles.sharePlanBtn}
        onPress={() => {
          Haptics.selectionAsync();
          const dateStr = dateForPlan.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
          const placeLine =
            structuredPlan?.venue?.name ??
            (chosenOption as { place?: string } | undefined)?.place ??
            (chosenOption?.option_name as string) ??
            (chosenOption?.narrative as string) ??
            "";
          const msg = [
            title,
            locationLineDisplay?.trim() ? `Location: ${locationLineDisplay.trim()}` : "",
            dateStr,
            schedule.length ? schedule.join(" · ") : "",
            placeLine ? `Venue: ${placeLine}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          Share.share({ message: msg, title: "Plan" }).catch(() => {});
        }}
        activeOpacity={0.8}
      >
        <Ionicons name="share-outline" size={20} color={Colors.primaryViolet} />
        <Text style={styles.sharePlanBtnText}>Share this plan</Text>
      </TouchableOpacity>

      {partner && (
        <TouchableOpacity
          style={styles.inviteToggle}
          onPress={() => { Haptics.selectionAsync(); setInviteToo((v) => !v); }}
          activeOpacity={0.8}
        >
          <Ionicons
            name={inviteToo ? "checkbox" : "square-outline"}
            size={24}
            color={inviteToo ? Colors.primaryViolet : Colors.gray500}
          />
          <Text style={styles.inviteToggleText}>Invite {partner.displayName} to this plan</Text>
        </TouchableOpacity>
      )}

      {!partner && !tripDays?.length ? (
        <View style={styles.recurrenceSection}>
          <Text style={styles.recurrenceLabel}>Add to planner</Text>
          <View style={styles.recurrenceRow}>
            <TouchableOpacity
              style={[styles.recurrenceChip, addRecurrence === "once" && styles.recurrenceChipActive]}
              onPress={() => { Haptics.selectionAsync(); setAddRecurrence("once"); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.recurrenceChipText, addRecurrence === "once" && styles.recurrenceChipTextActive]}>Just this time</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.recurrenceChip, addRecurrence === "weekly" && styles.recurrenceChipActive]}
              onPress={() => { Haptics.selectionAsync(); setAddRecurrence("weekly"); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.recurrenceChipText, addRecurrence === "weekly" && styles.recurrenceChipTextActive]}>Repeat weekly</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {conflictChecked && conflictingItems.length > 0 && (
        <View style={styles.conflictSection}>
          <Text style={styles.conflictText}>
            You have {conflictingItems[0].title} at that time.
          </Text>
          <View style={styles.conflictActions}>
            <TouchableOpacity style={styles.conflictSecondaryBtn} onPress={onBack} activeOpacity={0.8}>
              <Text style={styles.conflictSecondaryText}>Pick another time</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.conflictPrimaryBtn, saving && styles.primaryBtnDisabled]}
              onPress={() => { Haptics.selectionAsync(); handleAddToPlanner(); }}
              disabled={saving}
              activeOpacity={0.9}
            >
              {saving ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={styles.conflictPrimaryText}>Add anyway</Text>}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {onCorrectDetails ? (
        <View style={styles.correctDetailsSection}>
          <Text style={styles.correctDetailsLabel}>Correct details</Text>
          <View style={styles.refinementRow}>
            {REFINEMENT_SUGGESTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => {
                  Haptics.selectionAsync();
                  onCorrectDetails(s);
                }}
                style={styles.refinementChip}
                activeOpacity={0.8}
              >
                <Text style={styles.refinementChipText}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.refinementCustomRow}>
            <TextInput
              style={styles.refinementInput}
              placeholder="Or type your own (e.g. quieter place)"
              placeholderTextColor={Colors.gray500}
              value={refinementCustom}
              onChangeText={setRefinementCustom}
              onSubmitEditing={() => {
                if (refinementCustom.trim()) {
                  onCorrectDetails(refinementCustom.trim());
                }
              }}
            />
            <TouchableOpacity
              onPress={() => {
                if (refinementCustom.trim()) {
                  Haptics.selectionAsync();
                  onCorrectDetails(refinementCustom.trim());
                }
              }}
              style={[styles.refinementSubmitBtn, !refinementCustom.trim() && styles.refinementSubmitBtnDisabled]}
              disabled={!refinementCustom.trim()}
            >
              <Text style={styles.refinementSubmitText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {!(conflictChecked && conflictingItems.length > 0) && (
        <TouchableOpacity
          style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
          onPress={handleAddToPlanner}
          disabled={saving}
          activeOpacity={0.9}
        >
          {saving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.primaryBtnText}>
              {inviteToo && partner ? `Send selection & invite ${partner.displayName}` : "Add to planner"}
            </Text>
          )}
        </TouchableOpacity>
      )}
    </GestureScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 24 },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  backText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  title: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  whyLabel: {
    ...Typography.caption,
    color: Colors.gray500,
    fontWeight: "600",
    marginBottom: 4,
  },
  why: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 12,
  },
  correctDetailsSection: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  correctDetailsLabel: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "600",
    marginBottom: 8,
  },
  refinementRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
  },
  refinementChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Colors.gray100,
    marginRight: 8,
    marginBottom: 6,
  },
  refinementChipText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "500",
  },
  refinementCustomRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  refinementInput: {
    flex: 1,
    marginRight: 8,
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  refinementSubmitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.primaryViolet,
  },
  refinementSubmitBtnDisabled: { opacity: 0.5 },
  refinementSubmitText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: "600",
  },
  tripTimeline: { gap: 12, marginBottom: 16 },
  tripDayCard: {
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primaryViolet,
  },
  tripDayTitle: {
    ...Typography.caption,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  tripSlot: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 6,
  },
  scheduleBlock: {
    backgroundColor: Colors.gray100,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  sharePlanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  sharePlanBtnText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  scheduleLine: {
    ...Typography.caption,
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  inviteToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  inviteToggleText: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  recurrenceSection: { marginBottom: 16 },
  recurrenceLabel: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "600",
    marginBottom: 8,
  },
  recurrenceRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  recurrenceChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
  },
  recurrenceChipActive: { backgroundColor: Colors.primaryViolet },
  recurrenceChipText: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "500",
  },
  recurrenceChipTextActive: { color: Colors.white },
  conflictSection: {
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.accentYellow,
  },
  conflictText: {
    ...Typography.body,
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  conflictActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  conflictSecondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray300,
  },
  conflictSecondaryText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  conflictPrimaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: Colors.primaryViolet,
    minWidth: 120,
    alignItems: "center",
  },
  conflictPrimaryText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: "600",
  },
  errorText: {
    ...Typography.caption,
    color: Colors.errorRed,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: {
    ...Typography.button,
    color: Colors.white,
  },
});
