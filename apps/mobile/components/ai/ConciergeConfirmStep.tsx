/**
 * Last step before adding to planner: show chosen option summary,
 * conflict check, "Just this time" / "Repeat weekly", and "Add to planner".
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Share,
  Linking,
  Platform,
  Alert,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Card, PrimaryButton } from "@/components/ds";
import { useAppTheme, accentYellow, type AppTheme } from "@/constants/design-system";
import { PlanCardMapLink } from "@/components/plans/PlanCard";
import {
  callWinklyPlan,
  reportConciergeOutcome,
  type ConciergeContext,
  type ExperienceOption,
  type WinklyPlanOption,
} from "@/lib/ai/conciergeClient";
import type { PlannerThemePlanOption, PlannerTripDay } from "@/lib/ai/strategicHost";
import type { Mode } from "@/types";
import { createPlannerItemForSelf, createPlannerInvite } from "@/lib/plannerInvitations";
import { requestDateSafetyPrompt } from "@/lib/safety/dateCheckinPrompt";
import { createDirectChat, sendMessage } from "@/lib/chats";
import { getPlannerItems } from "@/lib/access/planner";
import { supabase } from "@/lib/supabase";
import { recordBusinessAnalyticsEvent } from "@/lib/business/analyticsStore";
import { PlanRecommendationFeedback } from "@/components/planner/PlanRecommendationFeedback";
import { sparkVenueFullAddressLine } from "@/lib/ai/weeklySpark";
import { parseClockTimeFromText } from "@/lib/ai/planTimeValidation";

type PlannerItemRow = { id: string; title: string; starts_at: string; ends_at: string | null };

const DEFAULT_ITEM_DURATION_MS = 2 * 60 * 60 * 1000;

/**
 * Planner items often have no `ends_at`; assume a normal outing length instead of an open-ended
 * window, otherwise every legacy item would "conflict" with every future plan forever.
 */
function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string | null
): boolean {
  const aS = new Date(aStart).getTime();
  const aE = new Date(aEnd).getTime();
  const bS = new Date(bStart).getTime();
  if (Number.isNaN(aS) || Number.isNaN(aE) || Number.isNaN(bS)) return false;
  const parsedEnd = bEnd ? new Date(bEnd).getTime() : NaN;
  const bE = Number.isNaN(parsedEnd) ? bS + DEFAULT_ITEM_DURATION_MS : parsedEnd;
  return aS < bE && aE > bS;
}

/** Only upcoming items can clash with a plan the user is about to make. */
function isRelevantForConflicts(item: PlannerItemRow, now = Date.now()): boolean {
  const start = new Date(item.starts_at).getTime();
  if (Number.isNaN(start)) return false;
  const parsedEnd = item.ends_at ? new Date(item.ends_at).getTime() : NaN;
  const end = Number.isNaN(parsedEnd) ? start + DEFAULT_ITEM_DURATION_MS : parsedEnd;
  return end >= now;
}

/** Same-day plans that don't overlap but leave little room to travel between them. */
type NearbyItem = { item: PlannerItemRow; position: "before" | "after"; gapMinutes: number };

const TIGHT_GAP_MINUTES = 90;

function findNearbyItems(
  planStart: string,
  planEnd: string,
  items: PlannerItemRow[]
): NearbyItem[] {
  const planS = new Date(planStart).getTime();
  const planE = new Date(planEnd).getTime();
  const out: NearbyItem[] = [];
  for (const it of items) {
    const itS = new Date(it.starts_at).getTime();
    if (Number.isNaN(itS)) continue;
    const itE = it.ends_at ? new Date(it.ends_at).getTime() : itS + 2 * 60 * 60 * 1000;
    if (Number.isNaN(itE)) continue;
    if (planS < itE && planE > itS) continue; // hard conflict — handled separately
    const gapBefore = planS - itE;
    const gapAfter = itS - planE;
    if (gapBefore >= 0 && gapBefore <= TIGHT_GAP_MINUTES * 60 * 1000) {
      out.push({ item: it, position: "before", gapMinutes: Math.round(gapBefore / 60000) });
    } else if (gapAfter >= 0 && gapAfter <= TIGHT_GAP_MINUTES * 60 * 1000) {
      out.push({ item: it, position: "after", gapMinutes: Math.round(gapAfter / 60000) });
    }
  }
  return out.sort((a, b) => a.gapMinutes - b.gapMinutes);
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `buildStartsEnds()` below already guards single-day plans against landing in the past (rolls
 * forward whole days until the resolved start clears "now"). A multi-day trip doesn't go through
 * that helper — each day's start is built directly from its own `date` string — so it needs the
 * same guard applied separately, anchored on day 1's 09:00 start and carried uniformly across
 * every day so the itinerary's day-to-day spacing isn't compressed.
 */
function daysUntilFutureFromIso(iso: string): number {
  let shift = 0;
  let t = new Date(iso).getTime();
  while (t <= Date.now()) {
    shift += 1;
    t += ONE_DAY_MS;
  }
  return shift;
}

function shiftDateStr(dateStr: string, days: number): string {
  if (days === 0) return dateStr;
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Fields of the plan-details card the user can adjust one at a time (pencil → confirm). */
type EditableField = "title" | "date" | "time" | "venue" | "address";

function hmToDate(base: Date, hm: string): Date {
  const d = new Date(base);
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (m) d.setHours(Math.min(23, parseInt(m[1], 10)), Math.min(59, parseInt(m[2], 10)), 0, 0);
  else d.setHours(19, 0, 0, 0);
  return d;
}

function dateToHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTimeLabel(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function parseTimeFromOption(option: ExperienceOption): { hour: number; minute: number } {
  const first =
    option.itinerary?.find((s) => (s as { time?: string }).time)?.time ??
    option.itinerary?.[0]?.time ??
    option.schedule?.[0];
  return parseClockTimeFromText(first) ?? { hour: 19, minute: 0 };
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
  // Authoritative last guard: a plan is never written to the planner in the past. If the
  // resolved start has already elapsed (stale AI itinerary time, or the flow sat open past
  // the chosen slot), roll forward a day at a time until it's genuinely in the future.
  const now = Date.now();
  while (start.getTime() <= now) {
    start.setDate(start.getDate() + 1);
  }
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
  /** Called once the planner_items insert (or invite) actually succeeds. Receives the created
   * planner_item id when one exists yet (not for the "pending_plan" invite branch, which only
   * creates the item once the invite is accepted) so the caller can navigate straight to it. */
  onDone: (plannerItemId?: string) => void;
  onBack: () => void;
  /** When set, show "Correct Details" to refine (e.g. "Make it cheaper", "Earlier time"). Calls with refinement hint. */
  onCorrectDetails?: (refinementHint: string) => void;
  /** When no partner yet, show an "Invite someone" entry that opens a picker (e.g. Spark solo plans). */
  onInviteSomeone?: () => void;
  /** When a partner is set, open the picker again to choose someone else (any mode). */
  onChangeInvitee?: () => void;
  /**
   * Chat / planner mode for this invite. Independent of the plan's original Spark slot —
   * e.g. a Date spark can invite a friend under Friends mode.
   */
  inviteModeOptions?: Array<"romance" | "friends" | "business">;
  inviteMode?: "romance" | "friends" | "business";
  onInviteModeChange?: (mode: "romance" | "friends" | "business") => void;
  /** Allow editing title / date / time / venue before adding (Weekly Spark details). */
  allowEditDetails?: boolean;
  /** Opens the user's Planner so they can sanity-check a tight schedule. Defaults to routing to /planner. */
  onReviewPlanner?: () => void;
  /** Links thumb feedback to ai_requests.outcome_satisfaction when set. */
  aiRequestId?: string;
  /** Weekly Spark plan id this confirm step originated from — tags the created planner item so its card can show "Planned" until next Monday's Spark replaces it. */
  sparkPlanId?: string;
  /** Called with the created planner_item id once "Add to planner" (or invite) succeeds, when sparkPlanId is set. */
  onAddedToPlanner?: (plannerItemId: string) => void;
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
  onInviteSomeone,
  onChangeInvitee,
  inviteModeOptions,
  inviteMode,
  onInviteModeChange,
  allowEditDetails = false,
  onReviewPlanner,
  aiRequestId,
  sparkPlanId,
  onAddedToPlanner,
  showInlineBack = true,
}: ConciergeConfirmStepProps) {
  const theme = useAppTheme();
  const styles = React.useMemo(() => makeStyles(theme), [theme]);
  const router = useRouter();
  const scrollRef = useRef<React.ComponentRef<typeof GestureScrollView>>(null);
  const [saving, setSaving] = useState(false);
  const [inviteToo, setInviteToo] = useState(!!partner);
  const [error, setError] = useState<string | null>(null);
  const [refinementCustom, setRefinementCustom] = useState("");
  const [conflictingItems, setConflictingItems] = useState<PlannerItemRow[]>([]);
  const [nearbyItems, setNearbyItems] = useState<NearbyItem[]>([]);
  const [conflictChecked, setConflictChecked] = useState(false);
  const [retimeRequested, setRetimeRequested] = useState(false);
  const [addRecurrence, setAddRecurrence] = useState<"once" | "weekly">("once");
  const [editTitle, setEditTitle] = useState("");
  const [editDate, setEditDate] = useState(dateForPlan);
  const [editTimeHm, setEditTimeHm] = useState(exactTimeHm ?? "");
  const [editPlace, setEditPlace] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftDate, setDraftDate] = useState<Date>(dateForPlan);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    setInviteToo(!!partner);
  }, [partner?.id]);

  const baseTitle =
    structuredPlan?.title ||
    (chosenOption?.option_name as string) ||
    (chosenOption?.narrative as string) ||
    "Plan";

  // Primitive deps only: parents rebuild `structuredPlan` on every render, so depending on the
  // object would reset the user's confirmed edits whenever the parent re-renders.
  const planVenueName = structuredPlan?.venue?.name ?? "";
  const planVenueAddress = structuredPlan?.venue?.address ?? "";
  const planFirstTime = structuredPlan?.itinerary?.[0]?.time?.trim() ?? "";
  const dateForPlanKey = dateForPlan.getTime();

  useEffect(() => {
    setEditTitle(baseTitle);
    setEditDate(new Date(dateForPlanKey));
    const hm =
      exactTimeHm && /^\d{2}:\d{2}$/.test(exactTimeHm)
        ? exactTimeHm
        : (() => {
            const m = planFirstTime.match(/(\d{1,2}):(\d{2})/);
            if (!m) return "";
            return `${m[1].padStart(2, "0")}:${m[2]}`;
          })();
    setEditTimeHm(hm);
    setEditPlace(planVenueName);
    setEditAddress(planVenueAddress || locationLineDisplay?.trim() || "");
    setEditingField(null);
    setShowDatePicker(false);
    setShowTimePicker(false);
  }, [baseTitle, dateForPlanKey, exactTimeHm, planFirstTime, planVenueName, planVenueAddress, locationLineDisplay]);

  const title = allowEditDetails ? (editTitle.trim() || baseTitle) : baseTitle;
  const effectiveDate = allowEditDetails ? editDate : dateForPlan;
  const effectiveTimeHm = allowEditDetails && /^\d{2}:\d{2}$/.test(editTimeHm) ? editTimeHm : exactTimeHm;
  const needsRetime = retimeRequested && conflictingItems.length > 0;
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
        ranges = [buildStartsEnds(effectiveDate, pseudo, effectiveTimeHm)];
      } else {
        ranges = [buildStartsEnds(effectiveDate, chosenOption as ExperienceOption, effectiveTimeHm)];
      }

      const allItems = await getPlannerItems(meId, undefined, 100);
      if (cancelled) return;
      const items = (allItems as PlannerItemRow[]).filter((it) => isRelevantForConflicts(it));
      const overlapping: PlannerItemRow[] = [];
      for (const r of ranges) {
        for (const it of items) {
          if (overlaps(r.starts_at, r.ends_at, it.starts_at, it.ends_at)) {
            overlapping.push(it);
            break;
          }
        }
      }
      const nearby = overlapping.length
        ? []
        : ranges.flatMap((r) => findNearbyItems(r.starts_at, r.ends_at, items));
      setConflictingItems(overlapping);
      setNearbyItems(nearby);
      setConflictChecked(true);
      if (overlapping.length === 0) setRetimeRequested(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveDate, chosenOption, structuredPlan, effectiveTimeHm, tripDays, structuredItinerary]);

  const startEdit = (field: EditableField) => {
    Haptics.selectionAsync();
    setFieldError(null);
    setEditingField(field);
    if (field === "title") setDraftText(editTitle);
    if (field === "venue") setDraftText(editPlace);
    if (field === "address") setDraftText(editAddress);
    if (field === "date") {
      setDraftDate(editDate);
      setShowDatePicker(true);
    }
    if (field === "time") {
      setDraftDate(hmToDate(editDate, editTimeHm));
      setShowTimePicker(true);
    }
  };

  const cancelEdit = () => {
    Haptics.selectionAsync();
    setEditingField(null);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setFieldError(null);
  };

  /** Changes only take effect once the user taps the confirm check. */
  const commitEdit = () => {
    if (!editingField) return;
    if (editingField === "title") {
      if (!draftText.trim()) {
        setFieldError("Give your plan a title.");
        return;
      }
      setEditTitle(draftText.trim());
    }
    if (editingField === "venue") setEditPlace(draftText.trim());
    if (editingField === "address") setEditAddress(draftText.trim());
    if (editingField === "date") setEditDate(draftDate);
    if (editingField === "time") setEditTimeHm(dateToHm(draftDate));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingField(null);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setFieldError(null);
  };

  /**
   * Conflict resolution stays inside the form when date/time are editable — sending the user
   * back to the Spark cards would throw away the plan they were about to make.
   */
  const handlePickAnotherTime = () => {
    Haptics.selectionAsync();
    if (!allowEditDetails) {
      onBack();
      return;
    }
    setRetimeRequested(true);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setTimeout(() => startEdit("time"), 400);
  };

  const handleReviewPlanner = () => {
    Haptics.selectionAsync();
    if (onReviewPlanner) {
      onReviewPlanner();
      return;
    }
    onBack();
    router.push("/planner");
  };

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
      /** Set once a planner_items row actually exists, so the success confirmation + onDone can
       * point at it. Stays undefined for the "pending_plan" invite branch, which only creates a
       * chat CTA and defers the planner_items insert until the invite is accepted. */
      let createdItemId: string | undefined;
      /** Clear success confirmation before leaving the flow — and a heads-up when the plan's
       * original time had already passed and was rolled forward (see buildStartsEnds/movedForward above). */
      const finishWithConfirmation = (
        itemId?: string,
        opts?: { movedForward?: boolean; kind?: "added" | "invited" }
      ) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const invited = opts?.kind === "invited";
        const body = invited
          ? "Your invite is on its way — it'll show in your planner once they respond."
          : opts?.movedForward
            ? "That time had already passed today, so we scheduled it for the next matching day instead."
            : "Your plan is on the calendar.";
        Alert.alert(invited ? "Invite sent" : "Added to your planner", body, [
          { text: "View planner", onPress: () => onDone(itemId) },
        ]);
      };
      // Days to shift a trip's first day forward so it isn't past-dated (see daysUntilFutureFromIso).
      // 0 for every other branch — buildStartsEnds() already guards those itself.
      let tripShiftDays = 0;
      if (structuredPlan?.trip_days?.length) {
        const first = structuredPlan.trip_days[0];
        const last = structuredPlan.trip_days[structuredPlan.trip_days.length - 1];
        tripShiftDays = daysUntilFutureFromIso(new Date(`${first.date}T09:00:00`).toISOString());
        const firstDate = shiftDateStr(first.date, tripShiftDays);
        const lastDate = shiftDateStr(last.date, tripShiftDays);
        const start = new Date(`${firstDate}T09:00:00`);
        const end = new Date(`${lastDate}T21:00:00`);
        starts_at = start.toISOString();
        ends_at = end.toISOString();
      } else if (structuredPlan) {
        const pseudo: ExperienceOption = {
          option_name: structuredPlan.title,
          itinerary: structuredItinerary.map((s) => ({ time: s.time, activity: s.description })),
        };
        const se = buildStartsEnds(effectiveDate, pseudo, effectiveTimeHm);
        starts_at = se.starts_at;
        ends_at = se.ends_at;
      } else {
        const se = buildStartsEnds(effectiveDate, chosenOption as ExperienceOption, effectiveTimeHm);
        starts_at = se.starts_at;
        ends_at = se.ends_at;
      }

      // buildStartsEnds() already rolled starts_at/ends_at forward if the resolved time had
      // passed; detect that here (by calendar-day drift from the requested date) purely to tell
      // the user, not to re-shift anything.
      const movedForward =
        !structuredPlan?.trip_days?.length && new Date(starts_at).toDateString() !== effectiveDate.toDateString();

      const activity = title;
      const place = allowEditDetails
        ? (editPlace.trim() || structuredPlan?.venue?.name || undefined)
        : structuredPlan?.venue?.name
          ? structuredPlan.venue.name
          : (chosenOption as { place?: string })?.place ??
            (chosenOption as { venue_name?: string })?.venue_name ??
            (chosenOption?.option_name as string) ??
            (chosenOption?.narrative as string) ??
            undefined;
      const location = allowEditDetails
        ? (editAddress.trim() || locationLineDisplay?.trim() || undefined)
        : structuredPlan?.venue?.address
          ? structuredPlan.venue.address
          : locationLineDisplay?.trim()
            ? locationLineDisplay.trim()
            : undefined;
      const conciergeMeta: Record<string, unknown> = {
        from_concierge: true,
        ...(aiRequestId ? { ai_request_id: aiRequestId } : {}),
        ...(sparkPlanId ? { weekly_spark_plan_id: sparkPlanId } : {}),
        activity,
        location,
        place,
      };
      // Kept on the planner item even though the UI no longer renders a "why it fits" line.
      const description =
        structuredPlan?.why_this_fits?.trim() ||
        structuredPlan?.fit_reason?.trim() ||
        (chosenOption?.narrative as string | undefined)?.trim() ||
        undefined;
      const payload = {
        title,
        description,
        source_mode: mode,
        starts_at,
        ends_at,
        activity,
        location,
        place,
        item_meta: conciergeMeta,
      };

      if (structuredPlan?.trip_days?.length) {
        const baseTitle = structuredPlan.title || title;
        let firstTripItemId: string | null = null;
        for (const d of structuredPlan.trip_days) {
          // Shift every day by the same amount so a trip starting "today" but generated after
          // 09:00 still lands on future dates without compressing the itinerary.
          const dayDate = shiftDateStr(d.date, tripShiftDays);
          const dayStart = new Date(`${dayDate}T09:00:00`);
          const dayEnd = new Date(`${dayDate}T21:00:00`);
          const description = [
            `Morning: ${d.morning.summary}`,
            `Afternoon: ${d.afternoon.summary}`,
            d.evening ? `Evening: ${d.evening.summary}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          const dayItemId = await createPlannerItemForSelf(meId, {
            title: `${baseTitle} · Day ${d.day}`,
            description,
            source_mode: mode,
            starts_at: dayStart.toISOString(),
            ends_at: dayEnd.toISOString(),
            activity,
            location,
            place,
            item_meta: {
              from_concierge: true,
              ...(aiRequestId ? { ai_request_id: aiRequestId } : {}),
              concierge_trip: true,
              trip_day: d.day,
              trip_date: dayDate,
              morning: d.morning,
              afternoon: d.afternoon,
              evening: d.evening ?? null,
              activity,
              location,
              place,
            },
          });
          if (firstTripItemId === null) firstTripItemId = dayItemId;
        }
        finishWithConfirmation(firstTripItemId ?? undefined, { movedForward: tripShiftDays > 0 });
        return;
      }

      if (inviteToo && partner) {
        const conversationId = await createDirectChat(partner.id, mode, "invite", meId);
        // Locked-in plans (Weekly Sparks / theme confirm) already have venue + time —
        // invite that exact plan. Open-ended concierge still regenerates via winkly_plan.
        const hasLockedPlan = !!structuredPlan?.venue?.name || allowEditDetails;
        if (hasLockedPlan) {
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
          if (sparkPlanId) onAddedToPlanner?.(planner_item_id);
          createdItemId = planner_item_id;
        } else {
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
              user_prompt: String(chosenOption?.option_name ?? title ?? "Plan"),
              activity_hint: String(chosenOption?.option_name ?? title ?? "Plan"),
            },
          });

          const pendingPlanId = planRes.pending_plan_id;
          if (!pendingPlanId) {
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
        let firstItemId: string | null = null;
        for (const weekOffset of weeks) {
          const startDate = new Date(effectiveDate);
          startDate.setDate(startDate.getDate() + weekOffset * 7);
          // buildStartsEnds() itself guards each occurrence against landing in the past (only
          // week 0 could ever need it — the rest are always days out).
          const { starts_at: s, ends_at: e } = buildStartsEnds(startDate, recurrenceSeed);
          const weekItemId = await createPlannerItemForSelf(meId, {
            ...payload,
            starts_at: s,
            ends_at: e,
          });
          if (firstItemId === null) firstItemId = weekItemId;
        }
        if (sparkPlanId && firstItemId) onAddedToPlanner?.(firstItemId);
        createdItemId = firstItemId ?? undefined;
      } else {
        const itemId = await createPlannerItemForSelf(meId, payload);
        createdItemId = itemId;
        if (sparkPlanId) onAddedToPlanner?.(itemId);
        if (aiRequestId) {
          void reportConciergeOutcome(aiRequestId, "added_to_planner");
        }
        if (mode === "romance") {
          void requestDateSafetyPrompt({
            plannerItemId: itemId,
            partnerUserId: partner?.id ?? null,
            scheduledAt: starts_at,
          });
        }
        const opt = chosenOption as Record<string, unknown> | undefined;
        const businessId = String(opt?.business_id ?? opt?.businessId ?? "");
        const offerId = String(opt?.offer_id ?? opt?.offerId ?? "");
        if (businessId) {
          void recordBusinessAnalyticsEvent({
            businessId,
            eventType: "add_to_planner",
            metadata: {
              offer_id: offerId || undefined,
              planner_item_id: itemId,
              source: "concierge",
            },
          });
        }
      }
      finishWithConfirmation(createdItemId, {
        movedForward,
        kind: inviteToo && partner ? "invited" : "added",
      });
    } catch (e) {
      // Surface the real Postgres/Supabase message (e.g. the future-plan-time or RLS check that
      // rejected the insert) rather than a generic failure — both to the console for debugging
      // and to the UI so the user isn't left guessing why "Add to planner" didn't work.
      const message = e instanceof Error && e.message ? e.message : "Something went wrong.";
      console.error("[ConciergeConfirmStep] Add to planner failed:", e);
      setError(message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setSaving(false);
    }
  };

  const renderDetailRow = (row: {
    field: EditableField;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string;
    placeholder: string;
    first?: boolean;
    flagged?: boolean;
    multiline?: boolean;
  }) => {
    const editing = editingField === row.field;
    const isPicker = row.field === "date" || row.field === "time";
    const pickerVisible = row.field === "date" ? showDatePicker : showTimePicker;
    return (
      <View
        key={row.field}
        style={[
          styles.detailRow,
          !row.first && styles.detailRowDivided,
          editing && styles.detailRowEditing,
          row.flagged && !editing && styles.detailRowFlagged,
        ]}
      >
        <View style={styles.detailIconWrap}>
          <Ionicons name={row.icon} size={17} color={theme.colors.primary} />
        </View>

        <View style={styles.detailBody}>
          <Text style={styles.detailLabel}>{row.label}</Text>

          {editing && isPicker ? (
            <Text style={styles.detailValue}>
              {row.field === "date" ? formatDateLabel(draftDate) : formatTimeLabel(draftDate)}
            </Text>
          ) : editing ? (
            <TextInput
              style={[styles.detailInput, row.multiline && styles.detailInputMultiline]}
              value={draftText}
              onChangeText={setDraftText}
              placeholder={row.placeholder}
              placeholderTextColor={theme.colors.textMuted}
              autoFocus
              multiline={row.multiline}
              blurOnSubmit={!row.multiline}
              returnKeyType="done"
              onSubmitEditing={row.multiline ? undefined : commitEdit}
            />
          ) : (
            <Text style={[styles.detailValue, !row.value && styles.detailValuePlaceholder]}>
              {row.value || row.placeholder}
            </Text>
          )}

          {editing && isPicker && pickerVisible ? (
            <DateTimePicker
              value={draftDate}
              mode={row.field === "date" ? "date" : "time"}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              minimumDate={row.field === "date" ? new Date() : undefined}
              onChange={(_, d) => {
                if (Platform.OS !== "ios") {
                  setShowDatePicker(false);
                  setShowTimePicker(false);
                }
                if (d) setDraftDate(d);
              }}
            />
          ) : null}

          {editing && isPicker && !pickerVisible ? (
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                if (row.field === "date") setShowDatePicker(true);
                else setShowTimePicker(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.detailPickAgain}>
                {row.field === "date" ? "Pick another date" : "Pick another time"}
              </Text>
            </TouchableOpacity>
          ) : null}

          {editing && fieldError ? <Text style={styles.detailError}>{fieldError}</Text> : null}
        </View>

        <View style={styles.detailActions}>
          {editing ? (
            <>
              <TouchableOpacity
                style={styles.detailCancelBtn}
                onPress={cancelEdit}
                hitSlop={8}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Discard ${row.label.toLowerCase()} change`}
              >
                <Ionicons name="close" size={18} color={theme.colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.detailConfirmBtn}
                onPress={commitEdit}
                hitSlop={8}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Apply ${row.label.toLowerCase()}`}
              >
                <Ionicons name="checkmark" size={19} color={theme.colors.onPrimary} />
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.detailEditBtn, editingField !== null && styles.detailEditBtnMuted]}
              onPress={() => startEdit(row.field)}
              disabled={editingField !== null}
              hitSlop={8}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${row.label.toLowerCase()}`}
            >
              <Ionicons
                name="pencil"
                size={16}
                color={editingField !== null ? theme.colors.textMuted : theme.colors.primary}
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <GestureScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      {showInlineBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.primary} />
          <Text style={styles.backText}>{allowEditDetails ? "Close" : "Back to options"}</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={[theme.type.h2, { color: theme.colors.textPrimary, fontFamily: theme.type.h2.fontFamily, marginBottom: theme.spacing.sm }]}>
        {allowEditDetails ? "Plan details" : title}
      </Text>
      {allowEditDetails ? (
        <View style={styles.editBlock}>
          <Text style={styles.editIntro}>
            Everything is set — tap a pencil to adjust, then the check to apply.
          </Text>

          {retimeRequested && conflictingItems.length > 0 ? (
            <View style={styles.retimeBanner}>
              <Ionicons name="time-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.retimeBannerText}>
                {`“${conflictingItems[0].title}” is already in your Planner then. Adjust the date or time below.`}
              </Text>
            </View>
          ) : null}

          <Card elevation={1} padding="none" style={styles.detailCard}>
            {renderDetailRow({
              field: "title",
              icon: "sparkles-outline",
              label: "Plan",
              value: editTitle,
              placeholder: "Add a title",
              first: true,
            })}
            {renderDetailRow({
              field: "date",
              icon: "calendar-outline",
              label: "Date",
              value: formatDateLabel(editDate),
              placeholder: "Pick a date",
              flagged: needsRetime,
            })}
            {renderDetailRow({
              field: "time",
              icon: "time-outline",
              label: "Time",
              value: editTimeHm ? formatTimeLabel(hmToDate(editDate, editTimeHm)) : "",
              placeholder: "Pick a time",
              flagged: needsRetime,
            })}
            {renderDetailRow({
              field: "venue",
              icon: "storefront-outline",
              label: "Venue",
              value: editPlace,
              placeholder: "Add a venue",
            })}
            {renderDetailRow({
              field: "address",
              icon: "location-outline",
              label: "Address",
              value: editAddress,
              placeholder: "Street + number, PLZ, City, Country",
              multiline: true,
            })}
          </Card>

          {(structuredPlan?.venue?.google_maps_link || editPlace.trim() || editAddress.trim()) ? (
            <View style={{ marginTop: theme.spacing.md, alignSelf: "flex-start" }}>
              <PlanCardMapLink
                onPress={() => {
                  const q = [editPlace.trim(), editAddress.trim()].filter(Boolean).join(", ");
                  const venueChanged =
                    editPlace.trim() !== (structuredPlan?.venue?.name ?? "").trim() ||
                    editAddress.trim() !== (structuredPlan?.venue?.address ?? locationLineDisplay?.trim() ?? "").trim();
                  const url = venueChanged
                    ? (q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null)
                    : structuredPlan?.venue?.google_maps_link?.trim() ||
                      (q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null);
                  if (url) void Linking.openURL(url).catch(() => {});
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}
      {!allowEditDetails && structuredPlan?.venue?.name ? (
        <Card elevation={0} padding="md" style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginBottom: theme.spacing.lg }}>
          <View style={{ flex: 1, gap: 2 }}>
            {(() => {
              const line = sparkVenueFullAddressLine({
                name: structuredPlan.venue.name,
                address: structuredPlan.venue.address || locationLineDisplay?.trim() || null,
              });
              return line ? (
                <Text style={[theme.type.bodyMedium, { color: theme.colors.textPrimary, fontFamily: theme.type.bodyMedium.fontFamily }]}>
                  {line}
                </Text>
              ) : null;
            })()}
          </View>
          {structuredPlan.venue.google_maps_link ? (
            <PlanCardMapLink
              label="Maps"
              onPress={() => void Linking.openURL(structuredPlan.venue.google_maps_link).catch(() => {})}
            />
          ) : null}
        </Card>
      ) : null}
      {/* When editing (e.g. Spark confirm), date/time/venue fields already cover this — skip itinerary echo. */}
      {!allowEditDetails && tripDays?.length ? (
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
      ) : !allowEditDetails && schedule.length > 0 ? (
        <View style={styles.scheduleBlock}>
          {schedule.map((line, i) => (
            <Text key={i} style={styles.scheduleLine}>{line}</Text>
          ))}
        </View>
      ) : null}

      <PlanRecommendationFeedback
        planSummary={title}
        mode={mode}
        aiRequestId={aiRequestId}
        label="Did this match what you had in mind?"
      />

      <TouchableOpacity
        style={styles.sharePlanBtn}
        onPress={() => {
          Haptics.selectionAsync();
          const dateStr = effectiveDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
          const placeLine =
            (allowEditDetails ? editPlace : structuredPlan?.venue?.name) ||
            (chosenOption as { place?: string } | undefined)?.place ||
            (chosenOption?.option_name as string) ||
            (chosenOption?.narrative as string) ||
            "";
          const addressLine =
            (allowEditDetails ? editAddress.trim() : structuredPlan?.venue?.address?.trim()) ||
            locationLineDisplay?.trim() ||
            "";
          const msg = [
            title,
            addressLine ? `Location: ${addressLine}` : "",
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
        <Ionicons name="share-outline" size={20} color={theme.colors.primary} />
        <Text style={styles.sharePlanBtnText}>Share this plan</Text>
      </TouchableOpacity>

      {partner && (
        <View style={styles.invitePartnerBlock}>
          <TouchableOpacity
            style={styles.inviteToggle}
            onPress={() => { Haptics.selectionAsync(); setInviteToo((v) => !v); }}
            activeOpacity={0.8}
          >
            <Ionicons
              name={inviteToo ? "checkbox" : "square-outline"}
              size={24}
              color={inviteToo ? theme.colors.primary : theme.colors.textMuted}
            />
            <Text style={styles.inviteToggleText}>Invite {partner.displayName} to this plan</Text>
          </TouchableOpacity>

          {onChangeInvitee ? (
            <TouchableOpacity
              style={styles.changeInviteeBtn}
              onPress={() => { Haptics.selectionAsync(); onChangeInvitee(); }}
              activeOpacity={0.85}
            >
              <Text style={styles.changeInviteeText}>Choose someone else</Text>
            </TouchableOpacity>
          ) : null}

          {inviteToo && inviteModeOptions && inviteModeOptions.length > 0 && onInviteModeChange ? (
            <View style={styles.inviteModeSection}>
              <Text style={styles.inviteModeLabel}>Send as</Text>
              <Text style={styles.inviteModeHint}>
                Pick the mode for the chat and planner tab — independent of how this plan was suggested.
              </Text>
              <View style={styles.inviteModeRow}>
                {inviteModeOptions.map((m) => {
                  const label =
                    m === "romance" ? "Romance" : m === "friends" ? "Friends" : "Business";
                  const active = inviteMode === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.inviteModeChip, active && styles.inviteModeChipActive]}
                      onPress={() => { Haptics.selectionAsync(); onInviteModeChange(m); }}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.inviteModeChipText, active && styles.inviteModeChipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
        </View>
      )}

      {!partner && onInviteSomeone ? (
        <TouchableOpacity
          style={styles.inviteSomeoneBtn}
          onPress={() => { Haptics.selectionAsync(); onInviteSomeone(); }}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <Ionicons name="person-add-outline" size={20} color={theme.colors.primary} />
          <Text style={styles.inviteSomeoneBtnText}>Invite someone</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      ) : null}

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
            <TouchableOpacity
              style={styles.conflictSecondaryBtn}
              onPress={handlePickAnotherTime}
              activeOpacity={0.8}
            >
              <Text style={styles.conflictSecondaryText}>
                {allowEditDetails ? "Change date or time" : "Pick another time"}
              </Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <PrimaryButton title="Add anyway" onPress={handleAddToPlanner} loading={saving} />
            </View>
          </View>
          <TouchableOpacity onPress={handleReviewPlanner} activeOpacity={0.7} style={styles.conflictLinkBtn}>
            <Text style={styles.conflictLinkText}>Review my Planner</Text>
          </TouchableOpacity>
        </View>
      )}

      {conflictChecked && conflictingItems.length === 0 && nearbyItems.length > 0 && (
        <View style={styles.tightGapSection}>
          <View style={styles.tightGapHeader}>
            <Ionicons name="alert-circle-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.tightGapTitle}>Tight schedule</Text>
          </View>
          {nearbyItems.slice(0, 2).map((n) => (
            <Text key={`${n.item.id}-${n.position}`} style={styles.tightGapText}>
              {n.position === "before"
                ? `“${n.item.title}” ends only ${n.gapMinutes} min before this plan starts.`
                : `“${n.item.title}” starts only ${n.gapMinutes} min after this plan ends.`}
            </Text>
          ))}
          <Text style={styles.tightGapText}>
            Allow for travel time, or move one of them so you can enjoy both.
          </Text>
          <View style={styles.tightGapActions}>
            {allowEditDetails ? (
              <TouchableOpacity
                style={styles.conflictSecondaryBtn}
                onPress={handlePickAnotherTime}
                activeOpacity={0.8}
              >
                <Text style={styles.conflictSecondaryText}>Change date or time</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.conflictSecondaryBtn}
              onPress={handleReviewPlanner}
              activeOpacity={0.8}
            >
              <Text style={styles.conflictSecondaryText}>Review my Planner</Text>
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
              placeholderTextColor={theme.colors.textMuted}
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
        <>
          <PrimaryButton
            title={inviteToo && partner ? `Send selection & invite ${partner.displayName}` : "Add to planner"}
            onPress={handleAddToPlanner}
            loading={saving}
            disabled={editingField !== null}
          />
          {editingField !== null ? (
            <Text style={styles.pendingEditHint}>Apply your change with the check to continue.</Text>
          ) : null}
        </>
      )}
    </GestureScrollView>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 24 },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  backText: {
    ...theme.type.caption,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  editBlock: { marginBottom: 20 },
  editIntro: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    marginBottom: 12,
  },
  detailCard: {
    overflow: "hidden",
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  detailRowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  detailRowEditing: { backgroundColor: theme.colors.primary + "0A" },
  detailRowFlagged: { backgroundColor: accentYellow + "1F" },
  detailIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary + "12",
    marginTop: 2,
  },
  detailBody: { flex: 1, gap: 2 },
  detailLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.colors.textSecondary,
  },
  detailValue: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    fontWeight: "500",
  },
  detailValuePlaceholder: { color: theme.colors.textMuted, fontWeight: "400" },
  detailInput: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    borderWidth: 1,
    borderColor: theme.colors.primary + "55",
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  detailInputMultiline: { minHeight: 76, textAlignVertical: "top" },
  detailPickAgain: {
    ...theme.type.caption,
    color: theme.colors.primary,
    fontWeight: "600",
    marginTop: 6,
  },
  detailError: {
    ...theme.type.caption,
    color: theme.colors.error,
    marginTop: 4,
  },
  detailActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  detailEditBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.backgroundMuted,
  },
  detailEditBtnMuted: { opacity: 0.5 },
  detailCancelBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.backgroundMuted,
  },
  detailConfirmBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    ...theme.elevation(2),
  },
  pendingEditHint: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },
  retimeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    marginBottom: 12,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primary + "12",
  },
  retimeBannerText: {
    ...theme.type.caption,
    flex: 1,
    color: theme.colors.textPrimary,
    lineHeight: 18,
  },
  correctDetailsSection: {
    marginBottom: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  correctDetailsLabel: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
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
    backgroundColor: theme.colors.backgroundMuted,
    marginRight: 8,
    marginBottom: 6,
  },
  refinementChipText: {
    ...theme.type.caption,
    color: theme.colors.primary,
    fontWeight: "500",
  },
  refinementCustomRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  refinementInput: {
    flex: 1,
    marginRight: 8,
    ...theme.type.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  refinementSubmitBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: theme.colors.primary,
  },
  refinementSubmitBtnDisabled: { opacity: 0.5 },
  refinementSubmitText: {
    ...theme.type.caption,
    color: theme.colors.onPrimary,
    fontWeight: "600",
  },
  tripTimeline: { gap: 12, marginBottom: 16 },
  tripDayCard: {
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  tripDayTitle: {
    ...theme.type.caption,
    fontWeight: "700",
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  tripSlot: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    marginBottom: 6,
  },
  scheduleBlock: {
    backgroundColor: theme.colors.backgroundMuted,
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
    ...theme.type.caption,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  scheduleLine: {
    ...theme.type.caption,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  invitePartnerBlock: { marginBottom: 16, gap: 10 },
  inviteToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  inviteToggleText: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  changeInviteeBtn: { paddingVertical: 4, paddingLeft: 34 },
  changeInviteeText: {
    ...theme.type.caption,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  inviteModeSection: { gap: 6, paddingLeft: 2 },
  inviteModeLabel: {
    ...theme.type.caption,
    fontWeight: "700",
    color: theme.colors.textSecondary,
  },
  inviteModeHint: {
    ...theme.type.caption,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  inviteModeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  inviteModeChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.backgroundMuted,
  },
  inviteModeChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary + "18",
  },
  inviteModeChipText: {
    ...theme.type.caption,
    fontWeight: "600",
    color: theme.colors.textSecondary,
  },
  inviteModeChipTextActive: { color: theme.colors.primary },
  inviteSomeoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.primary + "55",
    backgroundColor: theme.colors.primary + "10",
  },
  inviteSomeoneBtnText: {
    ...theme.type.body,
    fontWeight: "600",
    color: theme.colors.primary,
    flex: 1,
  },
  recurrenceSection: { marginBottom: 16 },
  recurrenceLabel: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    fontWeight: "600",
    marginBottom: 8,
  },
  recurrenceRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  recurrenceChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: theme.colors.backgroundMuted,
  },
  recurrenceChipActive: { backgroundColor: theme.colors.primary },
  recurrenceChipText: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    fontWeight: "500",
  },
  recurrenceChipTextActive: { color: theme.colors.onPrimary },
  conflictSection: {
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: accentYellow,
  },
  conflictText: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    marginBottom: 10,
  },
  conflictActions: { flexDirection: "row", gap: 10, alignItems: "center" },
  conflictSecondaryBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  conflictSecondaryText: {
    ...theme.type.caption,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  conflictLinkBtn: { marginTop: 10, alignSelf: "flex-start" },
  conflictLinkText: {
    ...theme.type.caption,
    color: theme.colors.primary,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  tightGapSection: {
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
    gap: 6,
  },
  tightGapHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  tightGapTitle: {
    ...theme.type.caption,
    fontWeight: "700",
    color: theme.colors.textPrimary,
  },
  tightGapText: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
  tightGapActions: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 4, flexWrap: "wrap" },
  errorText: {
    ...theme.type.caption,
    color: theme.colors.error,
    marginBottom: 12,
  },
  });
}
