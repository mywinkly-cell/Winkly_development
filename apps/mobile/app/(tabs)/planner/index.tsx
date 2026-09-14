// apps/mobile/app/planner/index.tsx
// Winkly – Planner Hub (v8.1)
// Top header: Filter | Winkly | Settings (PlannerHeader on all Planner screens)
// Tab bar: All | Dates | Meet-ups | Business | Events | Archive
// Content: Planned activities per active tab, filterable

import React, { useState, useMemo, useCallback, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "@/lib/useSafeAreaInsets";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useAppTheme, type AppTheme, type ModeName } from "@/constants/design-system";
import { supabase } from "@/lib/supabase";
import { getPlannerItems } from "@/lib/access/planner";
import { getSavedIdeas } from "@/lib/ai/conciergeStorage";
import {
  getPlannerPreferences,
  DEFAULT_PLANNER_PREFERENCES,
  type PlannerPreferences,
} from "@/lib/planner/preferences";
import {
  dismissWeeklyWeekend,
  getWeeklyWeekendDismissedUntil,
  clearWeeklySparkDismissed,
  scheduleSaturdayPlannerNudgeIfNeeded,
} from "@/lib/ai/proactiveSuggestion";
import {
  buildWeeklyWeekendSuggestion,
  fetchWeeklySparkPlansForContext,
  plannerTabToSparkContext,
  modeForSparkSlot,
} from "@/lib/ai/weekendIdeasPlans";
import { useDefaultLocation } from "@/lib/ai/useDefaultCity";
import { WeekendIdeasBlock } from "@/components/planner/WeekendIdeasBlock";
import { PlanCard, PlanCardBadge, PlanCardMeta, PlanCardIconAction } from "@/components/plans/PlanCard";
import type { WeeklySparkSettingsSave } from "@/components/planner/WeeklySparkSettingsBar";
import { SparkPlanConfirmModal } from "@/components/planner/SparkPlanConfirmModal";
import {
  getCurrentWeeklySpark,
  getPlannedSparkPlanIds,
  WEEKLY_SPARK_FOCUS_PARAM,
  WEEKLY_SPARK_FOCUS_VALUE,
  getWeeklySparkWeekKey,
  type WeeklySpark,
  type WeeklySparkPlan,
  type PlannedSparkPlanInfo,
} from "@/lib/ai/weeklySpark";
import {
  DEFAULT_WEEKLY_SPARK_RADIUS_KM,
  SMART_WEEKLY_SPARK_TIMING,
  getWeeklySparkLocationPrefs,
  getWeeklySparkTimingPrefs,
  saveWeeklySparkLocationPrefs,
  saveWeeklySparkTimingPrefs,
  sparkLocationCacheKey,
  type WeeklySparkLocationPrefs,
  type WeeklySparkTimingPrefs,
} from "@/lib/ai/weeklySparkSettings";
import { SparklesIcon } from "@/components/ui/WinklyAISpark";
import { WeatherPivotBanner } from "@/components/planner/WeatherPivotBanner";
import { PlanRatingSection } from "@/components/planner/PlanRatingSection";
import { EventParticipantCard } from "@/components/ui/EventParticipantCard";
import { PlannerHeader } from "@/components/layout/PlannerHeader";
import { EventReminderModal } from "@/components/planner/EventReminderModal";
import { PlanRecommendationFeedback } from "@/components/planner/PlanRecommendationFeedback";
import type { PlanRecommendationRating } from "@/lib/ai/planRecommendationFeedback";
import type { Mode } from "@/types";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";
import { useAppLocaleTag } from "@/lib/i18n/appLocale";

type TabKey = "all" | "dates" | "meetups" | "business" | "events" | "archive";
type TimeRange =
  | "all"
  | "today"
  | "specific_day"
  | "this_week"
  | "next_week"
  | "this_weekend"
  | "next_weekend"
  | "specific_week"
  | "this_month"
  | "next_month"
  | "specific_month";

type Participant = {
  id: string;
  photoUrl?: string | null;
  /** For events: full card info shown in details */
  firstName?: string;
  birthday?: string | null;
  city?: string | null;
  occupation?: string | null;
  isOrganizer?: boolean;
};

type PlannerItem = {
  id: string;
  title: string;
  timeLabel: string;
  dateStr: string;
  source: TabKey;
  sortKey: number;
  topic: string;
  description?: string;
  location?: string;
  isOrganiser?: boolean;
  status: "active" | "archived";
  archivedAt?: string;
  /** Participants: for dates/1-1 = 2; for groups = 3+ with +N overflow */
  participants?: Participant[];
  /** True when this plan was added from AI concierge. */
  fromConcierge?: boolean;
  aiRequestId?: string;
  recommendationFeedback?: PlanRecommendationRating | null;
};

const AVATAR_SIZE = 40;
/** Icon display sizes on list cards (44px button). Cancel = baseline; Confirm/Reschedule larger if assets have more padding. */
const CARD_ACTION_ICON_CONFIRM = 38;
const CARD_ACTION_ICON_RESCHEDULE = 36;
const CARD_ACTION_ICON_CANCEL = 34;
/** Icon display sizes in details modal. Cancel = baseline; Confirm/Reschedule larger if assets have more padding. */
const DETAIL_ACTION_ICON_CONFIRM = 40;
const DETAIL_ACTION_ICON_RESCHEDULE = 38;
const DETAIL_ACTION_ICON_CANCEL = 36;

function AvatarImage({ photoUrl, size }: { photoUrl?: string | null; size: number }) {
  const theme = useAppTheme();
  const avatarStyles = createAvatarStyles(theme);
  const [loadFailed, setLoadFailed] = useState(false);
  const showPlaceholder = !photoUrl || loadFailed;
  return (
    <View style={[avatarStyles.avatarWrap, { width: size, height: size, borderRadius: size / 2 }]}>
      {showPlaceholder ? (
        <View style={[avatarStyles.placeholderBg, { width: size, height: size, borderRadius: size / 2 }]}>
          <Ionicons name="person" size={size * 0.5} color={theme.colors.textMuted} />
        </View>
      ) : (
        <Image
          source={{ uri: photoUrl }}
          style={avatarStyles.avatar}
          resizeMode="cover"
          onError={() => setLoadFailed(true)}
        />
      )}
    </View>
  );
}

function getTabConfig(theme: AppTheme): { key: TabKey; labelKey: string; accent: string; secondary: string }[] {
  return [
    { key: "all", labelKey: "planner.allTab", accent: theme.colors.primary, secondary: theme.colors.surface },
    { key: "dates", labelKey: "planner.dates", accent: theme.modeAccent("romance").primary, secondary: theme.modeAccent("romance").bg },
    { key: "meetups", labelKey: "planner.meetups", accent: theme.modeAccent("friends").primary, secondary: theme.modeAccent("friends").bg },
    { key: "business", labelKey: "planner.business", accent: theme.modeAccent("business").primary, secondary: theme.modeAccent("business").bg },
    { key: "events", labelKey: "planner.events", accent: theme.modeAccent("events").primary, secondary: theme.modeAccent("events").bg },
    { key: "archive", labelKey: "planner.archive", accent: theme.colors.textSecondary, secondary: theme.colors.border },
  ];
}

const TIME_RANGE_KEYS: { key: TimeRange; labelKey: string }[] = [
  { key: "all", labelKey: "planner.allTime" },
  { key: "today", labelKey: "planner.today" },
  { key: "specific_day", labelKey: "planner.pickDate" },
  { key: "this_week", labelKey: "planner.thisWeek" },
  { key: "next_week", labelKey: "planner.nextWeek" },
  { key: "this_weekend", labelKey: "planner.thisWeekend" },
  { key: "next_weekend", labelKey: "planner.nextWeekend" },
  { key: "specific_week", labelKey: "planner.pickWeek" },
  { key: "this_month", labelKey: "planner.thisMonth" },
  { key: "next_month", labelKey: "planner.nextMonth" },
  { key: "specific_month", labelKey: "planner.pickMonth" },
];

const CANCEL_RESPONSE_KEYS = [
  "planner.cancelResponses.somethingCameUp",
  "planner.cancelResponses.cantMakeIt",
  "planner.cancelResponses.scheduleChanged",
  "planner.cancelResponses.reconnect",
] as const;

export type OverviewMode = "list" | "week" | "month";

/** Parse dateStr "DD.MM.YYYY" or "D.M.YYYY" to start-of-day Date (local). Used for week/month grouping. */
function parseItemDate(dateStr: string): Date {
  if (!dateStr || typeof dateStr !== "string") return new Date(NaN);
  const parts = dateStr.trim().split(".");
  if (parts.length !== 3) return new Date(NaN);
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return new Date(NaN);
  const d = new Date(year, month, day);
  return isNaN(d.getTime()) ? new Date(NaN) : d;
}

/** Monday of the week containing d. */
function getWeekStart(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Same calendar day (ignore time). */
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** True if the event's date is before today (user can no longer manage it). */
function isItemPast(dateStr: string): boolean {
  const d = parseItemDate(dateStr);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/** Format YYYY-MM-DD for day key. */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Display order for mode dots in month calendar (Date → Meet-ups → Business → Events). */
const MONTH_DOT_SOURCE_ORDER: TabKey[] = ["dates", "meetups", "business", "events"];

function getISOWeekNumber(d: Date): number {
  const target = new Date(d);
  const dayNr = (target.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.getTime();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  return 1 + Math.ceil((firstThursday - target.getTime()) / 604800000);
}

function getWeeksForYear(year: number, locale: string): { key: string; label: string }[] {
  const weeks: { key: string; label: string }[] = [];
  const jan1 = new Date(year, 0, 1);
  const dayOfWeek = jan1.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const firstMonday = new Date(year, 0, 1);
  firstMonday.setDate(jan1.getDate() + mondayOffset);

  for (let i = 0; i < 53; i++) {
    const weekStart = new Date(firstMonday.getTime());
    weekStart.setDate(firstMonday.getDate() + i * 7);
    if (weekStart.getFullYear() > year) break;
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const cw = getISOWeekNumber(weekStart);
    const key = `${weekStart.getFullYear()}-${weekStart.getMonth()}-${weekStart.getDate()}`;
    const startStr = weekStart.toLocaleDateString(locale, { month: "short", day: "numeric" });
    const endStr = weekEnd.toLocaleDateString(locale, { month: "short", day: "numeric" });
    const label = `cw ${cw} ${startStr} - ${endStr}`;
    weeks.push({ key, label });
  }
  return weeks;
}

function getMonthsForYear(year: number, locale: string): { key: string; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => ({
    key: `${year}-${String(i + 1).padStart(2, "0")}`,
    label: new Date(year, i, 1).toLocaleDateString(locale, { month: "long", year: "numeric" }),
  }));
}

const TOPIC_OPTIONS = [
  "All topics",
  "Dancing",
  "Networking",
  "Wine tasting",
  "Sports",
  "Coffee",
  "Dining",
  "Arts & Culture",
  "Outdoors",
  "Music",
  "Business meetings",
];

const INITIAL_ITEMS: PlannerItem[] = [];

function ParticipantAvatars({
  participants,
  source,
  myPhotoBySource,
}: {
  participants: Participant[];
  source?: TabKey;
  myPhotoBySource?: Partial<Record<TabKey, string | null>>;
}) {
  const theme = useAppTheme();
  const avatarStyles = createAvatarStyles(theme);
  const list = participants?.length ? participants : [{ id: "p1", photoUrl: null }, { id: "p2", photoUrl: null }];
  const display = list.length <= 2 ? list : list.slice(0, 3);
  const extra = list.length > 3 ? list.length - 3 : 0;
  const getPhoto = (p: Participant) => {
    if (p.id === "me" && source && myPhotoBySource?.[source] != null) return myPhotoBySource[source] ?? null;
    return p.photoUrl;
  };
  return (
    <View style={avatarStyles.row}>
      {display.map((p, i) => (
        <View key={p.id} style={i > 0 ? { marginLeft: -AVATAR_SIZE * 0.35 } : undefined}>
          <AvatarImage photoUrl={getPhoto(p)} size={AVATAR_SIZE} />
        </View>
      ))}
      {extra > 0 && (
        <View style={[avatarStyles.avatarWrap, avatarStyles.extraBadge, { marginLeft: -AVATAR_SIZE * 0.35 }]}>
          <Text style={avatarStyles.extraText}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

function createAvatarStyles(theme: AppTheme) {
  return StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center" },
    avatarWrap: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      borderWidth: 2,
      borderColor: theme.colors.surface,
      overflow: "hidden",
      backgroundColor: theme.colors.border,
      ...theme.elevation(1),
    },
    avatar: { width: "100%", height: "100%" },
    placeholderBg: {
      backgroundColor: theme.colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    extraBadge: {
      backgroundColor: theme.colors.textMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    extraText: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: "#FFFFFF",
      fontWeight: "700",
    },
  });
}

const ARCHIVE_DAYS = 14;

type PlannerIndexProps = {
  /** When true, hides top header (Back/Filters/Settings) for use inside mode-selection etc. */
  embedded?: boolean;
  /** Initial tab when opened from a mode (e.g. Romance → dates, Friends → meetups). */
  initialTab?: TabKey;
  /** Notify parent headers when Weekly Sparks show/hide (embedded mode planners). */
  onWeeklySparkVisibilityChange?: (visible: boolean) => void;
};

export type PlannerIndexHandle = {
  openFilter: () => void;
  openConcierge: () => void;
  /** Show / reopen Weekly Sparks (clears dismiss). */
  openWeeklySparks: () => void;
  /** Hide Sparks (same as card dismiss). */
  hideWeeklySparks: () => void;
};

const PlannerIndex = forwardRef<PlannerIndexHandle, PlannerIndexProps>(function PlannerIndex({ embedded, initialTab, onWeeklySparkVisibilityChange }, ref) {
  const router = useRouter();
  const { t } = useTranslation();
  const appLocale = useAppLocaleTag();
  const fmtLocationLine = useFormatLocationDisplay();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const TAB_CONFIG = useMemo(() => getTabConfig(theme), [theme]);
  const BOTTOM_BAR_HEIGHT = theme.spacing.jumbo + theme.spacing.huge;
  const insets = useSafeAreaInsets();
  const filterModalBottomPadding = BOTTOM_BAR_HEIGHT + insets.bottom;
  // Deep-link from the mode-selection Spark nudge: focus + reveal the Spark section.
  const sparkParams = useLocalSearchParams<{ spark?: string }>();
  const focusSpark = sparkParams[WEEKLY_SPARK_FOCUS_PARAM] === WEEKLY_SPARK_FOCUS_VALUE;
  const scrollRef = useRef<ScrollView>(null);
  /** Bumped when Sparks are force-shown so a stale focus-effect can't re-hide them. */
  const sparkRevealGenRef = useRef(0);
  /** Bumped on each Sparks fetch so stale tab/city responses are ignored. */
  const weekendPlansLoadGenRef = useRef(0);
  /** Keep last successful pack per week+context+location so reopen doesn't refetch. */
  const weekendPlansCacheRef = useRef<Map<string, WeeklySparkPlan[]>>(new Map());
  const [itemsState, setItemsState] = useState<PlannerItem[]>(() =>
    INITIAL_ITEMS.map((it) => ({ ...it, status: "active" as const }))
  );
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab ?? "all");
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [topic, setTopic] = useState("All topics");
  const currentYear = new Date().getFullYear();
  const [filterYear, setFilterYear] = useState(currentYear);
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PlannerItem | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelCustomMessage, setCancelCustomMessage] = useState("");
  const [selectedCancelResponse, setSelectedCancelResponse] = useState<string | null>(null);
  const [myPhotoBySource, setMyPhotoBySource] = useState<Partial<Record<TabKey, string | null>>>({});
  const [overviewMode, setOverviewMode] = useState<OverviewMode>("list");
  const [listSortOrder, setListSortOrder] = useState<"earliest" | "latest">("earliest");
  const [viewedWeekStart, setViewedWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [selectedWeekDayKey, setSelectedWeekDayKey] = useState<string | null>(null);
  /** Y offsets (within the main scroll view) of each day's block in Week view, for tap-to-jump. */
  const weekDayBlockOffsetsRef = useRef<Record<string, number>>({});
  const [viewedMonth, setViewedMonth] = useState<Date>(() => new Date());
  const [selectedMonthDay, setSelectedMonthDay] = useState<string | null>(null);
  const [savedIdeasCount, setSavedIdeasCount] = useState(0);
  const [weeklySuggestion, setWeeklySuggestion] = useState<ReturnType<typeof buildWeeklyWeekendSuggestion> | null>(null);
  const [showWeeklyCard, setShowWeeklyCard] = useState(false);
  const [weeklySpark, setWeeklySpark] = useState<WeeklySpark | null>(null);
  const [weekendPlans, setWeekendPlans] = useState<WeeklySparkPlan[]>([]);
  const [weekendPlansLoading, setWeekendPlansLoading] = useState(false);
  const [weekendPlansError, setWeekendPlansError] = useState(false);
  const [selectedSparkPlan, setSelectedSparkPlan] = useState<WeeklySparkPlan | null>(null);
  const [sparkConfirmVisible, setSparkConfirmVisible] = useState(false);
  /** Spark plan id → its existing Planner entry, for cards already added ("Planned" CTA). */
  const [plannedSparkPlans, setPlannedSparkPlans] = useState<Map<string, PlannedSparkPlanInfo>>(new Map());
  const [sparkLocationPrefs, setSparkLocationPrefs] = useState<WeeklySparkLocationPrefs | null>(null);
  const [sparkTimingPrefs, setSparkTimingPrefs] = useState<WeeklySparkTimingPrefs>(
    SMART_WEEKLY_SPARK_TIMING
  );
  const [savingSparkLocationPrefs, setSavingSparkLocationPrefs] = useState(false);
  /** Sparks wait for stored settings so the first pack isn't generated with defaults, then redone. */
  const [sparkPrefsLoaded, setSparkPrefsLoaded] = useState(false);
  const { city: defaultCity, country: defaultCountry } = useDefaultLocation();
  const [plannerPrefs, setPlannerPrefs] = useState<PlannerPreferences>(DEFAULT_PLANNER_PREFERENCES);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [prefs, timing] = await Promise.all([
        getWeeklySparkLocationPrefs(),
        getWeeklySparkTimingPrefs(),
      ]);
      if (cancelled) return;
      setSparkLocationPrefs(prefs);
      setSparkTimingPrefs(timing);
      setSparkPrefsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelectedMonthDay(null);
  }, [viewedMonth]);

  useEffect(() => {
    getSavedIdeas().then((ideas) => setSavedIdeasCount(ideas.length));
  }, []);

  /** Pulls the user's confirmed planner_items (role owner/attendee) into itemsState. */
  const loadPlannerItems = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return;
      const data = await getPlannerItems(uid, undefined, 200);

      const mapped: PlannerItem[] = (data as Record<string, unknown>[]).map((row) => {
        const d = new Date(String(row.starts_at));
        const valid = !Number.isNaN(d.getTime());
        const dateStr = valid
          ? `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`
          : "";
        const timeLabel = valid ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
        const sourceMode = typeof row.source_mode === "string" ? row.source_mode : "events";
        const source: TabKey =
          sourceMode === "romance"
            ? "dates"
            : sourceMode === "friends"
              ? "meetups"
              : sourceMode === "business"
                ? "business"
                : "events";
        const meta = (row.meta ?? null) as Record<string, unknown> | null;
        const location =
          meta && typeof meta.location === "string" && meta.location ? meta.location : undefined;
        return {
          id: String(row.id),
          title: typeof row.title === "string" ? row.title : "Plan",
          timeLabel,
          dateStr,
          source,
          sortKey: valid ? d.getTime() : 0,
          topic: "All topics",
          description: typeof row.description === "string" && row.description ? row.description : undefined,
          location,
          isOrganiser: row.created_by === uid,
          status: "active" as const,
          fromConcierge: meta?.from_concierge === true,
          aiRequestId:
            meta && typeof meta.ai_request_id === "string" ? meta.ai_request_id : undefined,
        };
      });

      // Keep any purely-local "archived" flag (there's no DB column for it yet) across refetches
      // within the session, instead of letting a fresh pull silently un-archive it.
      setItemsState((prev) => {
        const prevById = new Map(prev.map((it) => [it.id, it]));
        return mapped.map((it) => {
          const old = prevById.get(it.id);
          return old?.status === "archived" ? { ...it, status: "archived" as const, archivedAt: old.archivedAt } : it;
        });
      });
    } catch (e) {
      console.warn("Planner: load items", e);
    }
  }, []);

  useEffect(() => {
    void loadPlannerItems();
  }, [loadPlannerItems]);

  useFocusEffect(
    useCallback(() => {
      getSavedIdeas().then((ideas) => setSavedIdeasCount(ideas.length));
      void scheduleSaturdayPlannerNudgeIfNeeded();
      void loadPlannerItems();
      let cancelled = false;
      const revealGenAtStart = sparkRevealGenRef.current;
      (async () => {
        const prefs = await getPlannerPreferences();
        if (cancelled) return;
        setPlannerPrefs(prefs);
        const spark = await getCurrentWeeklySpark();
        if (cancelled) return;
        setWeeklySpark(spark);

        if (activeTab === "archive") return;
        const weeklyDismissed = await getWeeklyWeekendDismissedUntil();
        // A deep-link / header reopen may have cleared dismiss while we were awaiting.
        if (cancelled || revealGenAtStart !== sparkRevealGenRef.current) return;
        const now = Date.now();
        const sparkDismissed =
          !focusSpark && weeklyDismissed != null && now <= weeklyDismissed;

        // Weekly Sparks only — structured plans with venue/time. No heuristic "Winkly suggestion".
        if (prefs.aiSuggestions && !sparkDismissed) {
          setShowWeeklyCard(true);
          setWeeklySuggestion(buildWeeklyWeekendSuggestion(spark?.plans));
        } else {
          setShowWeeklyCard(false);
          setWeeklySuggestion(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [activeTab, focusSpark, loadPlannerItems])
  );

  useEffect(() => {
    onWeeklySparkVisibilityChange?.(showWeeklyCard && activeTab !== "archive");
  }, [showWeeklyCard, activeTab, onWeeklySparkVisibilityChange]);

  useEffect(() => {
    if (!focusSpark) return;
    let cancelled = false;
    sparkRevealGenRef.current += 1;
    const revealGen = sparkRevealGenRef.current;
    void clearWeeklySparkDismissed().then(() => {
      if (cancelled || revealGen !== sparkRevealGenRef.current) return;
      setShowWeeklyCard(true);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
    });
    return () => {
      cancelled = true;
    };
  }, [focusSpark]);

  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user?.id) return;
        const uid = userData.user.id;

        const { data: up } = await supabase
          .from("user_profiles")
          .select("core_photos, main_photo_url")
          .eq("id", uid)
          .maybeSingle();

        const corePhotos = Array.isArray((up as any)?.core_photos) ? (up as any).core_photos.filter(Boolean) : [];
        const mainPhoto = (up as any)?.main_photo_url ?? corePhotos[0] ?? null;

        const { data: subs } = await supabase.from("sub_profiles").select("mode, photos").eq("user_id", uid);

        const byMode: Partial<Record<TabKey, string | null>> = {
          events: mainPhoto,
        };
        (subs ?? []).forEach((row: { mode: string; photos: string[] | null }) => {
          const photos = Array.isArray(row.photos) ? row.photos.filter(Boolean) : [];
          const first = photos[0] ?? mainPhoto;
          if (row.mode === "romance") byMode.dates = first;
          if (row.mode === "friends") byMode.meetups = first;
          if (row.mode === "business") byMode.business = first;
        });
        if (!byMode.dates) byMode.dates = mainPhoto;
        if (!byMode.meetups) byMode.meetups = mainPhoto;
        if (!byMode.business) byMode.business = mainPhoto;
        setMyPhotoBySource(byMode);
      } catch (e) {
        console.warn("Planner: load user photos", e);
      }
    })();
  }, []);

  const weekOptions = useMemo(() => getWeeksForYear(filterYear, appLocale), [filterYear, appLocale]);
  const monthOptions = useMemo(() => getMonthsForYear(filterYear, appLocale), [filterYear, appLocale]);

  const onTabPress = (key: TabKey) => {
    Haptics.selectionAsync();
    setActiveTab(key);
  };

  const onFiltersPress = useCallback(() => {
    Haptics.selectionAsync();
    setFilterModalVisible(true);
  }, []);

  const openConcierge = useCallback(() => {
    const modeParam = activeTab === "all" || activeTab === "archive" ? "all" : activeTab === "dates" ? "romance" : activeTab === "meetups" ? "friends" : activeTab === "business" ? "business" : "events";
    const tabParam = activeTab === "archive" ? "all" : activeTab;
    router.push({ pathname: "/concierge", params: { source_screen: "planner", mode: modeParam, source_planner_tab: tabParam } });
  }, [activeTab, router]);

  const handleWeeklyDismiss = useCallback(async () => {
    sparkRevealGenRef.current += 1;
    await dismissWeeklyWeekend();
    setShowWeeklyCard(false);
    setWeeklySuggestion(null);
    // Keep weekendPlans in state + cache so reopen shows the same cards without refetch.
    setWeekendPlansError(false);
  }, []);

  const openWeeklySparks = useCallback(async () => {
    Haptics.selectionAsync();
    sparkRevealGenRef.current += 1;
    const revealGen = sparkRevealGenRef.current;
    await clearWeeklySparkDismissed();
    if (revealGen !== sparkRevealGenRef.current) return;
    setShowWeeklyCard(true);
    if (weekendPlans.length) {
      setWeeklySuggestion(buildWeeklyWeekendSuggestion(weekendPlans));
    } else {
      setWeeklySuggestion(buildWeeklyWeekendSuggestion(weeklySpark?.plans));
    }
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  }, [weeklySpark?.plans, weekendPlans]);

  const toggleWeeklySparks = useCallback(() => {
    if (showWeeklyCard) {
      void handleWeeklyDismiss();
    } else {
      void openWeeklySparks();
    }
  }, [showWeeklyCard, handleWeeklyDismiss, openWeeklySparks]);

  const sparkContext = useMemo(() => plannerTabToSparkContext(activeTab), [activeTab]);

  const sparkCity = sparkLocationPrefs?.city || defaultCity || null;
  const sparkCountry = sparkLocationPrefs?.country || defaultCountry || undefined;
  const sparkRadiusKm = sparkLocationPrefs?.searchRadiusKm ?? DEFAULT_WEEKLY_SPARK_RADIUS_KM;
  const sparkPlansCacheKey = useMemo(
    () =>
      sparkLocationCacheKey({
        weekKey: getWeeklySparkWeekKey(),
        context: sparkContext,
        city: sparkCity ?? "",
        country: sparkCountry,
        searchRadiusKm: sparkRadiusKm,
        timing: sparkTimingPrefs,
      }),
    [sparkContext, sparkCity, sparkCountry, sparkRadiusKm, sparkTimingPrefs]
  );

  const loadWeekendPlans = useCallback(async (opts?: { force?: boolean }) => {
    const cacheKey = sparkPlansCacheKey;
    if (!opts?.force) {
      const cached = weekendPlansCacheRef.current.get(cacheKey);
      if (cached?.length) {
        setWeekendPlans(cached);
        setWeeklySuggestion(buildWeeklyWeekendSuggestion(cached));
        setWeekendPlansLoading(false);
        setWeekendPlansError(false);
        return;
      }
    }
    const loadGen = ++weekendPlansLoadGenRef.current;
    setWeekendPlansLoading(true);
    setWeekendPlansError(false);
    try {
      const plans = await fetchWeeklySparkPlansForContext({
        context: sparkContext,
        city: sparkCity,
        country: sparkCountry,
        searchRadiusKm: sparkRadiusKm,
        existingPlans: weeklySpark?.plans ?? [],
        timing: sparkTimingPrefs,
      });
      if (loadGen !== weekendPlansLoadGenRef.current) return;
      if (plans.length) {
        weekendPlansCacheRef.current.set(cacheKey, plans);
        setWeekendPlans(plans);
        setWeeklySuggestion(buildWeeklyWeekendSuggestion(plans));
      } else {
        setWeekendPlansError(true);
      }
    } catch {
      if (loadGen !== weekendPlansLoadGenRef.current) return;
      setWeekendPlansError(true);
    } finally {
      if (loadGen === weekendPlansLoadGenRef.current) {
        setWeekendPlansLoading(false);
      }
    }
  }, [
    sparkContext,
    weeklySpark?.plans,
    sparkCity,
    sparkCountry,
    sparkRadiusKm,
    sparkTimingPrefs,
    sparkPlansCacheKey,
  ]);

  // Load Sparks when shown / context or Spark settings change — reuse cache when possible.
  useEffect(() => {
    if (!showWeeklyCard || activeTab === "archive" || !sparkPrefsLoaded) return;
    const cached = weekendPlansCacheRef.current.get(sparkPlansCacheKey);
    if (cached?.length) {
      setWeekendPlans(cached);
      setWeekendPlansError(false);
      setWeekendPlansLoading(false);
      setWeeklySuggestion(buildWeeklyWeekendSuggestion(cached));
      return;
    }
    setWeekendPlans([]);
    void loadWeekendPlans();
  }, [showWeeklyCard, activeTab, sparkPrefsLoaded, sparkPlansCacheKey, loadWeekendPlans]);

  const handleSaveSparkLocationPrefs = useCallback(
    async (next: WeeklySparkSettingsSave) => {
      setSavingSparkLocationPrefs(true);
      try {
        const { timing, ...location } = next;
        const savedTiming = await saveWeeklySparkTimingPrefs(timing);
        setSparkTimingPrefs(savedTiming);
        const saved = await saveWeeklySparkLocationPrefs({ ...location, lock: true });
        setSparkLocationPrefs(saved);
        weekendPlansCacheRef.current.clear();
        const newKey = sparkLocationCacheKey({
          weekKey: saved.weekKey,
          context: sparkContext,
          city: saved.city,
          country: saved.country,
          searchRadiusKm: saved.searchRadiusKm,
          timing: savedTiming,
        });
        const loadGen = ++weekendPlansLoadGenRef.current;
        setWeekendPlans([]);
        setWeekendPlansLoading(true);
        setWeekendPlansError(false);
        try {
          const plans = await fetchWeeklySparkPlansForContext({
            context: sparkContext,
            city: saved.city,
            country: saved.country,
            searchRadiusKm: saved.searchRadiusKm,
            existingPlans: weeklySpark?.plans ?? [],
            timing: savedTiming,
          });
          if (loadGen !== weekendPlansLoadGenRef.current) return;
          if (plans.length) {
            weekendPlansCacheRef.current.set(newKey, plans);
            setWeekendPlans(plans);
            setWeeklySuggestion(buildWeeklyWeekendSuggestion(plans));
          } else {
            setWeekendPlansError(true);
          }
        } catch {
          if (loadGen !== weekendPlansLoadGenRef.current) return;
          setWeekendPlansError(true);
        } finally {
          if (loadGen === weekendPlansLoadGenRef.current) {
            setWeekendPlansLoading(false);
          }
        }
      } finally {
        setSavingSparkLocationPrefs(false);
      }
    },
    [sparkContext, weeklySpark?.plans]
  );
  const openSparkPlanConfirm = useCallback((plan: WeeklySparkPlan) => {
    Haptics.selectionAsync();
    setSelectedSparkPlan(plan);
    setSparkConfirmVisible(true);
  }, []);

  // Which of this week's Spark cards already have a matching Planner entry — refreshed whenever
  // the visible plan ids change (new pack fetched / week rolled over to Monday).
  useEffect(() => {
    const ids = [...weekendPlans.map((p) => p.id), ...(weeklySpark?.plans.map((p) => p.id) ?? [])];
    if (ids.length === 0) {
      setPlannedSparkPlans(new Map());
      return;
    }
    let cancelled = false;
    void getPlannedSparkPlanIds(ids).then((map) => {
      if (!cancelled) setPlannedSparkPlans(map);
    });
    return () => {
      cancelled = true;
    };
  }, [weekendPlans, weeklySpark?.plans]);

  const handleSparkPlanAdded = useCallback((sparkPlanId: string, plannerItemId: string) => {
    setPlannedSparkPlans((prev) => {
      const next = new Map(prev);
      const nowIso = new Date().toISOString();
      const existing = selectedSparkPlan;
      next.set(sparkPlanId, {
        plannerItemId,
        title: existing?.title ?? "",
        description: null,
        startsAt: existing?.startsAt ?? nowIso,
        endsAt: existing?.endsAt ?? null,
        sourceMode: existing ? modeForSparkSlot(existing.slot) : "events",
      });
      return next;
    });
    // The confirm modal is a plain overlay (no route change), so focus never re-fires — pull the
    // newly created item in explicitly so it shows up in the Planner list right away.
    void loadPlannerItems();
  }, [selectedSparkPlan, loadPlannerItems]);

  useImperativeHandle(
    ref,
    () => ({
      openFilter: onFiltersPress,
      openConcierge,
      openWeeklySparks: () => {
        void openWeeklySparks();
      },
      hideWeeklySparks: () => {
        void handleWeeklyDismiss();
      },
    }),
    [onFiltersPress, openConcierge, openWeeklySparks, handleWeeklyDismiss],
  );

  const applyFilters = () => {
    Haptics.selectionAsync();
    setFilterModalVisible(false);
  };

  const openDetails = useCallback((item: PlannerItem) => {
    Haptics.selectionAsync();
    setSelectedItem(item);
    setDetailsModalVisible(true);
  }, []);

  const closeDetails = useCallback(() => {
    setDetailsModalVisible(false);
    setSelectedItem(null);
  }, []);

  /** Opens the existing Planner entry for a Spark plan that's already "Planned". */
  const openReviewSparkPlan = useCallback((plan: WeeklySparkPlan) => {
    const info = plannedSparkPlans.get(plan.id);
    if (!info) {
      openSparkPlanConfirm(plan);
      return;
    }
    Haptics.selectionAsync();
    const d = new Date(info.startsAt);
    const dateStr = Number.isNaN(d.getTime())
      ? ""
      : `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    const timeLabel = Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const source: TabKey =
      info.sourceMode === "romance"
        ? "dates"
        : info.sourceMode === "friends"
          ? "meetups"
          : info.sourceMode === "business"
            ? "business"
            : "events";
    openDetails({
      id: info.plannerItemId,
      title: info.title || plan.title,
      timeLabel,
      dateStr,
      source,
      sortKey: d.getTime(),
      topic: t("weeklySpark.sectionTitle"),
      description: info.description ?? undefined,
      isOrganiser: true,
      status: "active",
      fromConcierge: true,
    });
  }, [plannedSparkPlans, openDetails, openSparkPlanConfirm, t]);

  const openCancelModal = useCallback(() => {
    setCancelModalVisible(true);
    setSelectedCancelResponse(null);
    setCancelCustomMessage("");
  }, []);

  const closeCancelModal = useCallback(() => {
    setCancelModalVisible(false);
  }, []);

  const archiveItem = useCallback((item: PlannerItem, _message: string) => {
    setItemsState((prev) =>
      prev.map((it) =>
        it.id === item.id
          ? { ...it, status: "archived" as const, archivedAt: new Date().toISOString() }
          : it
      )
    );
    // Persist cancellation on planner_items.meta so it's authoritative server-side — this is
    // what keeps a cancelled plan from ever surfacing a post-plan review prompt.
    void (async () => {
      const { data: row } = await supabase
        .from("planner_items")
        .select("meta")
        .eq("id", item.id)
        .maybeSingle();
      const prevMeta =
        row?.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
          ? (row.meta as Record<string, unknown>)
          : {};
      await supabase
        .from("planner_items")
        .update({ meta: { ...prevMeta, cancelled_at: new Date().toISOString() } })
        .eq("id", item.id);
    })();
    closeDetails();
    closeCancelModal();
  }, [closeDetails, closeCancelModal]);

  const restoreItem = useCallback((item: PlannerItem) => {
    Haptics.selectionAsync();
    setItemsState((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, status: "active" as const, archivedAt: undefined } : it
      )
    );
    void (async () => {
      const { data: row } = await supabase
        .from("planner_items")
        .select("meta")
        .eq("id", item.id)
        .maybeSingle();
      const prevMeta =
        row?.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
          ? (row.meta as Record<string, unknown>)
          : {};
      if (prevMeta.cancelled_at == null) return;
      const { cancelled_at: _cancelledAt, ...rest } = prevMeta;
      await supabase.from("planner_items").update({ meta: rest }).eq("id", item.id);
    })();
    closeDetails();
  }, [closeDetails]);

  const confirmCancel = useCallback(() => {
    if (!selectedItem) return;
    const msg = cancelCustomMessage.trim() || selectedCancelResponse || t("planner.cantMakeItDefault");
    Haptics.selectionAsync();
    archiveItem(selectedItem, msg);
  }, [selectedItem, cancelCustomMessage, selectedCancelResponse, archiveItem, t]);

  const todayStart = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const isPastContext = useMemo(() => {
    if (overviewMode === "week") {
      const weekEnd = new Date(viewedWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(0, 0, 0, 0);
      return weekEnd < todayStart;
    }
    if (overviewMode === "month") {
      const lastOfMonth = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() + 1, 0);
      lastOfMonth.setHours(0, 0, 0, 0);
      return lastOfMonth < todayStart;
    }
    if (overviewMode === "list") {
      if (timeRange === "specific_day") {
        const d = new Date(selectedDate);
        d.setHours(0, 0, 0, 0);
        return d < todayStart;
      }
      if (timeRange === "specific_week" && selectedWeek) {
        const parts = selectedWeek.split("-").map(Number);
        if (parts.length >= 3) {
          const weekStart = new Date(parts[0], parts[1], parts[2]);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekEnd.getDate() + 6);
          weekEnd.setHours(0, 0, 0, 0);
          return weekEnd < todayStart;
        }
      }
      if (timeRange === "specific_month" && selectedMonth) {
        const [y, m] = selectedMonth.split("-").map(Number);
        const lastOfMonth = new Date(y, m, 0);
        lastOfMonth.setHours(0, 0, 0, 0);
        return lastOfMonth < todayStart;
      }
    }
    return false;
  }, [overviewMode, timeRange, selectedDate, selectedWeek, selectedMonth, viewedWeekStart, viewedMonth, todayStart]);

  const items = useMemo(() => {
    const isArchiveTab = activeTab === "archive";
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - ARCHIVE_DAYS);
    // All tab: show every active item from dates, meetups, business, events. Other tabs: filter by source.
    let list: PlannerItem[] = isArchiveTab
      ? itemsState.filter((it) => {
          if (it.status !== "archived") return false;
          const arch = it.archivedAt ? new Date(it.archivedAt) : null;
          return arch && arch >= cutoff;
        })
      : itemsState.filter(
          (it) =>
            (it.status === "active" ||
              (plannerPrefs.showCompleted && it.status === "archived")) &&
            (activeTab === "all" || it.source === activeTab)
        );

    if (topic !== "All topics") {
      list = list.filter((it) => it.topic === topic);
    }

    if (!isArchiveTab && !isPastContext && plannerPrefs.onlyUpcoming) {
      list = list.filter((it) => {
        const d = parseItemDate(it.dateStr);
        if (isNaN(d.getTime())) return false;
        const eventStart = new Date(d);
        eventStart.setHours(0, 0, 0, 0);
        return eventStart >= todayStart;
      });
    }

    // Same sort for All and single-mode tabs: by date (sortKey) earliest or latest first.
    return list.sort((a, b) =>
      isArchiveTab
        ? (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")
        : listSortOrder === "latest"
          ? b.sortKey - a.sortKey
          : a.sortKey - b.sortKey
    );
  }, [activeTab, timeRange, topic, itemsState, listSortOrder, isPastContext, todayStart, plannerPrefs]);

  const showWeekendIdeas =
    activeTab !== "archive" &&
    showWeeklyCard &&
    plannerPrefs.aiSuggestions !== false;

  const today = todayStart;

  const weekDays = useMemo(() => {
    const start = new Date(viewedWeekStart);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  }, [viewedWeekStart]);

  const itemsByDayWeek = useMemo(() => {
    const weekEndExcl = new Date(viewedWeekStart);
    weekEndExcl.setDate(weekEndExcl.getDate() + 7);
    const map: Record<string, PlannerItem[]> = {};
    weekDays.forEach((d) => { map[dayKey(d)] = []; });
    items.forEach((it) => {
      const d = parseItemDate(it.dateStr);
      if (isNaN(d.getTime())) return;
      if (d >= viewedWeekStart && d < weekEndExcl) {
        const k = dayKey(d);
        if (!map[k]) map[k] = [];
        map[k].push(it);
      }
    });
    Object.keys(map).forEach((k) => map[k].sort((a, b) => a.sortKey - b.sortKey));
    return map;
  }, [items, viewedWeekStart, weekDays]);

  const monthGrid = useMemo(() => {
    const y = viewedMonth.getFullYear();
    const m = viewedMonth.getMonth();
    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);
    const startPad = (first.getDay() + 6) % 7;
    const days: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(new Date(y, m, d));
    const remainder = 42 - days.length;
    for (let i = 0; i < remainder; i++) days.push(null);
    return days;
  }, [viewedMonth]);

  const itemsByDayMonth = useMemo(() => {
    const y = viewedMonth.getFullYear();
    const m = viewedMonth.getMonth();
    const map: Record<string, PlannerItem[]> = {};
    items.forEach((it) => {
      const d = parseItemDate(it.dateStr);
      if (isNaN(d.getTime())) return;
      if (d.getFullYear() === y && d.getMonth() === m) {
        const k = dayKey(d);
        if (!map[k]) map[k] = [];
        map[k].push(it);
      }
    });
    Object.keys(map).forEach((k) => map[k].sort((a, b) => a.sortKey - b.sortKey));
    return map;
  }, [items, viewedMonth]);

  /** Items actually visible in the current overview (list / viewed week / viewed month). */
  const visibleItemCount = useMemo(() => {
    if (overviewMode === "week") {
      return Object.values(itemsByDayWeek).reduce((n, list) => n + list.length, 0);
    }
    if (overviewMode === "month") {
      return Object.values(itemsByDayMonth).reduce((n, list) => n + list.length, 0);
    }
    return items.length;
  }, [overviewMode, items, itemsByDayWeek, itemsByDayMonth]);

  /** Whenever the user is looking at an empty planner, introduce the concierge instead of a dead end. */
  const showConciergePromoCard =
    activeTab !== "archive" &&
    plannerPrefs.aiSuggestions !== false &&
    !isPastContext &&
    visibleItemCount === 0;

  const conciergePromoCard = showConciergePromoCard ? (
    <TouchableOpacity
      style={styles.conciergePromoCard}
      onPress={() => { Haptics.selectionAsync(); openConcierge(); }}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={t("planner.conciergePromo.title")}
    >
      <View style={styles.conciergePromoRow}>
        <View style={styles.conciergePromoAvatar}>
          <SparklesIcon size={22} color={theme.colors.onPrimary} />
        </View>
        <View style={styles.conciergePromoTextWrap}>
          <Text style={styles.conciergePromoText}>{t("planner.conciergePromo.title")}</Text>
          <Text style={styles.conciergePromoSub}>{t("planner.conciergePromo.body")}</Text>
        </View>
      </View>
      <View style={styles.conciergePromoCta}>
        <Text style={styles.conciergePromoCtaText}>{t("planner.conciergePromo.cta")}</Text>
        <Ionicons name="arrow-forward" size={16} color={theme.colors.onPrimary} />
      </View>
    </TouchableOpacity>
  ) : null;

  const renderItemCard = useCallback((it: PlannerItem) => {
    const past = isItemPast(it.dateStr);
    // Color by item's mode (source) so the All tab shows dates/meetups/business/events each with their own accent.
    const accent = TAB_CONFIG.find((t) => t.key === it.source)?.accent ?? theme.colors.primary;

    return (
      <PlanCard
        key={it.id}
        accentColor={accent}
        dimmed={past}
        onPress={() => openDetails(it)}
        title={it.title}
        badges={
          <>
            <PlanCardBadge label={it.dateStr} />
            {past ? <PlanCardBadge label="Past" /> : null}
            <PlanCardBadge label={it.topic} variant="outlined" color={accent} />
          </>
        }
        meta={<PlanCardMeta icon="time-outline">{it.timeLabel}</PlanCardMeta>}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <ParticipantAvatars participants={it.participants ?? []} source={it.source} myPhotoBySource={myPhotoBySource} />
          {!past && (
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              {it.status === "archived" ? (
                <PlanCardIconAction icon="arrow-undo" tone="primary" accessibilityLabel="Restore" onPress={() => restoreItem(it)} />
              ) : (
                <>
                  <TouchableOpacity onPress={() => { Haptics.selectionAsync(); openDetails(it); }} style={styles.cardActionBtn} hitSlop={12} accessibilityLabel="Confirm">
                    <Image source={require("@/assets/icons/confirm-icon.png")} style={{ width: CARD_ACTION_ICON_CONFIRM, height: CARD_ACTION_ICON_CONFIRM }} resizeMode="contain" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { Haptics.selectionAsync(); openDetails(it); }} style={styles.cardActionBtn} hitSlop={12} accessibilityLabel="Reschedule">
                    <Image source={require("@/assets/icons/reschedule-icon.png")} style={{ width: CARD_ACTION_ICON_RESCHEDULE, height: CARD_ACTION_ICON_RESCHEDULE }} resizeMode="contain" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setSelectedItem(it); setDetailsModalVisible(false); openCancelModal(); }} style={styles.cardActionBtn} hitSlop={12} accessibilityLabel="Cancel">
                    <Image source={require("@/assets/icons/decline-icon.png")} style={{ width: CARD_ACTION_ICON_CANCEL, height: CARD_ACTION_ICON_CANCEL }} resizeMode="contain" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      </PlanCard>
    );
  }, [openDetails, restoreItem, myPhotoBySource, openCancelModal, theme, styles, TAB_CONFIG]);

  return (
    <View style={styles.screen}>
      {/* TOP HEADER — Filter | Winkly | Weekly Sparks (+ optional AI) */}
      {!embedded && (
        <PlannerHeader
          onFilterPress={onFiltersPress}
          onWeeklySparkPress={
            activeTab !== "archive" && plannerPrefs.aiSuggestions !== false
              ? toggleWeeklySparks
              : undefined
          }
          weeklySparkActive={showWeekendIdeas}
          onAIPress={openConcierge}
        />
      )}

      {/* CONTENT WRAPPER — tabs + scroll (filter overlay covers only this so header & bottom bar stay visible) */}
      <View style={styles.contentWrapper}>
        {/* SECOND HEADER BAR — Tabs */}
        <View style={styles.tabBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabBarContent}
            style={styles.tabBarScroll}
          >
          {TAB_CONFIG.map((tab) => {
            const isActive = activeTab === tab.key;
            const bgColor = tab.key === "all" ? theme.colors.surface : tab.secondary;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => onTabPress(tab.key)}
                style={[
                  styles.tab,
                  { backgroundColor: bgColor },
                  isActive && styles.tabActive,
                ]}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { fontWeight: isActive ? "700" : "400" },
                    isActive && { color: tab.accent },
                  ]}
                >
                  {t(tab.labelKey)}
                </Text>
              </TouchableOpacity>
            );
          })}
          </ScrollView>
        </View>

        {/* MAIN CONTENT */}
        <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + filterModalBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab !== "archive" && <WeatherPivotBanner />}
        {activeTab !== "archive" && <PlanRatingSection />}
        {showWeekendIdeas && (
          <WeekendIdeasBlock
            plans={weekendPlans}
            loadingPlans={weekendPlansLoading}
            loadError={weekendPlansError}
            locale={appLocale}
            sparkContext={sparkContext}
            highlighted={focusSpark}
            onRetryLoad={() => void loadWeekendPlans({ force: true })}
            onDismiss={handleWeeklyDismiss}
            onViewPlan={openSparkPlanConfirm}
            plannedPlanIds={new Set(plannedSparkPlans.keys())}
            onReviewPlan={openReviewSparkPlan}
            showDismiss={showWeeklyCard}
            sparkLocationPrefs={sparkLocationPrefs}
            sparkTimingPrefs={sparkTimingPrefs}
            defaultLocationLine={
              defaultCity && defaultCountry
                ? `${defaultCity}, ${defaultCountry}`
                : defaultCity ?? undefined
            }
            defaultCity={defaultCity}
            defaultCountry={defaultCountry}
            savingLocationPrefs={savingSparkLocationPrefs}
            onSaveLocationPrefs={(next) => {
              void handleSaveSparkLocationPrefs(next);
            }}
          />
        )}
        <SparkPlanConfirmModal
          visible={sparkConfirmVisible}
          plan={selectedSparkPlan}
          locationLineDisplay={
            sparkLocationPrefs?.location ||
            (sparkCity && sparkCountry
              ? `${sparkCity}, ${sparkCountry}`
              : sparkCity ?? undefined)
          }
          onPlanAdded={handleSparkPlanAdded}
          onClose={() => {
            setSparkConfirmVisible(false);
            setSelectedSparkPlan(null);
          }}
        />
        {savedIdeasCount > 0 && (
          <TouchableOpacity
            style={styles.savedIdeasRow}
            onPress={() => { Haptics.selectionAsync(); openConcierge(); }}
            activeOpacity={0.8}
          >
            <Ionicons name="bookmark" size={20} color={theme.colors.primary} />
            <Text style={styles.savedIdeasRowText}>Saved ideas ({savedIdeasCount})</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}
        {overviewMode === "list" && (
          <>
            {conciergePromoCard}
            {items.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name={activeTab === "archive" ? "archive-outline" : "calendar-outline"} size={48} color={theme.colors.textMuted} style={{ marginBottom: 12 }} />
                <Text style={styles.emptyTitle}>{activeTab === "archive" ? t("planner.noArchivedPlans") : t("planner.noPlansYet")}</Text>
                <Text style={styles.emptySub}>{activeTab === "archive" ? t("planner.archivedEmptySub") : t("planner.upcomingEmptySub")}</Text>
              </View>
            ) : items.map((it) => renderItemCard(it))}
          </>
        )}

        {overviewMode === "week" && (
          <>
            <View style={styles.weekNav}>
              <TouchableOpacity onPress={() => { Haptics.selectionAsync(); const prev = new Date(viewedWeekStart); prev.setDate(prev.getDate() - 7); setViewedWeekStart(prev); }} style={styles.weekNavBtn} hitSlop={12}>
                <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.weekNavTitle}>
                {viewedWeekStart.toLocaleDateString(appLocale, { month: "short", day: "numeric" })} – {weekDays[6].toLocaleDateString(appLocale, { month: "short", day: "numeric", year: "numeric" })}
              </Text>
              <TouchableOpacity onPress={() => { Haptics.selectionAsync(); const next = new Date(viewedWeekStart); next.setDate(next.getDate() + 7); setViewedWeekStart(next); }} style={styles.weekNavBtn} hitSlop={12}>
                <Ionicons name="chevron-forward" size={24} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.weekStrip}>
              {weekDays.map((d) => {
                const isToday = isSameDay(d, today);
                const key = dayKey(d);
                const isSelected = selectedWeekDayKey === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedWeekDayKey(key);
                      const y = weekDayBlockOffsetsRef.current[key];
                      if (typeof y === "number") {
                        scrollRef.current?.scrollTo({ y: Math.max(y - 12, 0), animated: true });
                      }
                    }}
                    activeOpacity={0.7}
                    style={[styles.weekDayCell, isToday && styles.weekDayToday, isSelected && !isToday && styles.weekDaySelected]}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.weekDayName, isToday && styles.weekDayTodayText]}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d.getDay() === 0 ? 6 : d.getDay() - 1]}</Text>
                    <Text style={[styles.weekDayNum, isToday && styles.weekDayTodayText]}>{d.getDate()}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {conciergePromoCard ? <View style={styles.viewPromoWrap}>{conciergePromoCard}</View> : null}
            {visibleItemCount === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={theme.colors.textMuted} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>{t("planner.noPlansThisWeek")}</Text>
              <Text style={styles.emptySub}>{t("planner.upcomingEmptySub")}</Text>
            </View>
          ) : weekDays.map((d) => {
              const key = dayKey(d);
              const dayItems = itemsByDayWeek[key] ?? [];
              return (
                <View
                  key={key}
                  style={[styles.weekDayBlock, selectedWeekDayKey === key && styles.weekDayBlockSelected]}
                  onLayout={(e) => {
                    weekDayBlockOffsetsRef.current[key] = e.nativeEvent.layout.y;
                  }}
                >
                  <Text style={styles.weekDayBlockTitle}>{d.toLocaleDateString(appLocale, { day: "numeric", month: "short" })}</Text>
                  {dayItems.length === 0 ? <Text style={styles.weekDayEmpty}>No events</Text> : dayItems.map((it) => renderItemCard(it))}
                </View>
              );
            })}
          </>
        )}

        {overviewMode === "month" && (
          <>
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={() => { Haptics.selectionAsync(); const prev = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() - 1); setViewedMonth(prev); }} style={styles.weekNavBtn} hitSlop={12}>
                <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.weekNavTitle}>{viewedMonth.toLocaleDateString(appLocale, { month: "long", year: "numeric" })}</Text>
              <TouchableOpacity onPress={() => { Haptics.selectionAsync(); const next = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() + 1); setViewedMonth(next); }} style={styles.weekNavBtn} hitSlop={12}>
                <Ionicons name="chevron-forward" size={24} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.monthGrid}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((wd) => (
                <Text key={wd} style={styles.monthWeekdayHeader}>{wd}</Text>
              ))}
              {monthGrid.map((d, i) => {
                if (!d) return <View key={`empty-${i}`} style={styles.monthCell} />;
                const k = dayKey(d);
                const isToday = isSameDay(d, today);
                const isSelected = selectedMonthDay === k;
                const dayItems = itemsByDayMonth[k] ?? [];
                const sourcesPresent = MONTH_DOT_SOURCE_ORDER.filter((src) =>
                  dayItems.some((it) => it.source === src)
                );
                return (
                  <TouchableOpacity
                    key={k}
                    style={[
                      styles.monthCell,
                      isToday && styles.monthCellToday,
                      isSelected && styles.monthCellSelected,
                    ]}
                    activeOpacity={0.7}
                    onPress={() => { Haptics.selectionAsync(); setSelectedMonthDay(isSelected ? null : k); }}
                  >
                    <Text style={[styles.monthCellDay, isToday && styles.monthCellTodayText, isSelected && !isToday && styles.monthCellSelectedText]}>{d.getDate()}</Text>
                    {sourcesPresent.length > 0 && (
                      <View style={styles.monthCellIndicator}>
                        <View style={styles.monthCellDotsRow}>
                          {sourcesPresent.map((src) => (
                            <View
                              key={src}
                              style={[
                                styles.monthCellModeDot,
                                { backgroundColor: TAB_CONFIG.find((t) => t.key === src)?.accent ?? theme.colors.primary },
                              ]}
                            />
                          ))}
                        </View>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            {visibleItemCount === 0 ? (
              <View style={styles.monthEvents}>
                <View style={styles.monthEventsDivider} />
                {conciergePromoCard ? <View style={styles.viewPromoWrap}>{conciergePromoCard}</View> : null}
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={48} color={theme.colors.textMuted} style={{ marginBottom: 12 }} />
                  <Text style={styles.emptyTitle}>{t("planner.noPlansThisMonth")}</Text>
                  <Text style={styles.emptySub}>{t("planner.upcomingEmptySub")}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.monthEvents}>
                <View style={styles.monthEventsDivider} />
                {selectedMonthDay !== null ? (
                  (() => {
                    const dayItems = itemsByDayMonth[selectedMonthDay] ?? [];
                    const d = monthGrid.find((x): x is Date => x !== null && dayKey(x) === selectedMonthDay);
                    return (
                      <View style={styles.weekDayBlock}>
                        {d && <Text style={styles.weekDayBlockTitle}>{d.toLocaleDateString(appLocale, { day: "numeric", month: "short" })}</Text>}
                        {dayItems.length === 0 ? (
                          <View style={styles.emptyState}>
                            <Ionicons name="calendar-outline" size={48} color={theme.colors.textMuted} style={{ marginBottom: 12 }} />
                            <Text style={styles.emptyTitle}>Nothing planned yet.</Text>
                            <Text style={styles.emptySub}>Let&apos;s turn this date into something worth remembering.</Text>
                          </View>
                        ) : (
                          dayItems.map((it) => renderItemCard(it))
                        )}
                      </View>
                    );
                  })()
                ) : (
                  monthGrid.filter((d): d is Date => d !== null).map((d) => {
                    const dayItems = itemsByDayMonth[dayKey(d)] ?? [];
                    if (dayItems.length === 0) return null;
                    return (
                      <View key={dayKey(d)} style={styles.weekDayBlock}>
                        <Text style={styles.weekDayBlockTitle}>{d.toLocaleDateString(appLocale, { day: "numeric", month: "short" })}</Text>
                        {dayItems.map((it) => renderItemCard(it))}
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </>
        )}
        </ScrollView>

        {/* FILTER OVERLAY — same style as event card: dimmed background + outlined sheet; overlay stops above bar */}
        {filterModalVisible && (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { bottom: filterModalBottomPadding },
            ]}
            pointerEvents="box-none"
          >
            <BlurView
              intensity={60}
              tint="light"
              style={StyleSheet.absoluteFill}
            />
            <View style={[StyleSheet.absoluteFill, styles.sheetDimOverlay]} />
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => setFilterModalVisible(false)}
            />
            <View style={styles.filterSheetWrapper}>
              <View style={[styles.modalContent, styles.sheetPanel]} onStartShouldSetResponder={() => true}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t("planner.filtersAndViewsTitle")}</Text>
                  <TouchableOpacity onPress={() => setFilterModalVisible(false)} hitSlop={12}>
                    <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  contentContainerStyle={{ paddingBottom: 16 }}
                >
                  <Text style={styles.filterSection}>{t("planner.overview")}</Text>
                  <View style={styles.overviewRow}>
                    {(["list", "week", "month"] as const).map((mode) => (
                      <TouchableOpacity
                        key={mode}
                        onPress={() => { Haptics.selectionAsync(); setOverviewMode(mode); }}
                        style={[styles.overviewChip, overviewMode === mode && styles.filterChipActive]}
                      >
                        <Text style={[styles.filterChipText, overviewMode === mode && styles.filterChipTextActive]}>
                          {mode === "list" ? t("planner.listView") : mode === "week" ? t("planner.weekView") : t("planner.monthView")}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.filterSection}>{t("planner.sortList")}</Text>
                  <View style={styles.overviewRow}>
                    {(["earliest", "latest"] as const).map((order) => (
                      <TouchableOpacity
                        key={order}
                        onPress={() => { Haptics.selectionAsync(); setListSortOrder(order); }}
                        style={[styles.overviewChip, listSortOrder === order && styles.filterChipActive]}
                      >
                        <Text style={[styles.filterChipText, listSortOrder === order && styles.filterChipTextActive]}>
                          {order === "earliest" ? t("planner.earliestFirst") : t("planner.latestFirst")}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.filterSection}>{t("planner.timeRange")}</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filterRow}
                    contentContainerStyle={styles.filterRowContent}
                    keyboardShouldPersistTaps="handled"
                  >
                    {TIME_RANGE_KEYS.map((opt) => (
                      <TouchableOpacity
                        key={opt.key}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setTimeRange(opt.key);
                          if (opt.key !== "specific_week") setSelectedWeek(null);
                          if (opt.key !== "specific_month") setSelectedMonth(null);
                          if (opt.key !== "specific_day") setShowDatePicker(false);
                        }}
                        style={[styles.filterChip, timeRange === opt.key && styles.filterChipActive]}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.filterChipText, timeRange === opt.key && styles.filterChipTextActive]} numberOfLines={1}>
                          {t(opt.labelKey)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                {timeRange === "specific_day" && (
                  <View style={styles.pickerSection}>
                    <Text style={styles.pickerLabel}>Date</Text>
                    <TouchableOpacity
                      onPress={() => { Haptics.selectionAsync(); setShowDatePicker(!showDatePicker); }}
                      style={styles.dateDisplayBtn}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.dateDisplayText}>
                        {selectedDate.toLocaleDateString(appLocale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                      </Text>
                      <Ionicons name={showDatePicker ? "chevron-up" : "calendar-outline"} size={20} color={theme.colors.primary} />
                    </TouchableOpacity>
                    {showDatePicker && (
                      <DateTimePicker
                        value={selectedDate}
                        mode="date"
                        display={Platform.OS === "ios" ? "calendar" : "default"}
                        onChange={(event, d) => {
                          if (Platform.OS === "android") setShowDatePicker(false);
                          if (event.type === "set" && d) setSelectedDate(d);
                        }}
                      />
                    )}
                  </View>
                )}

                {timeRange === "specific_week" && (
                  <View style={styles.pickerSection}>
                    <Text style={styles.pickerLabel}>Year</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearRow}>
                      {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                        <TouchableOpacity
                          key={y}
                          onPress={() => { Haptics.selectionAsync(); setFilterYear(y); setSelectedWeek(null); }}
                          style={[styles.yearChip, filterYear === y && styles.filterChipActive]}
                        >
                          <Text style={[styles.filterChipText, filterYear === y && styles.filterChipTextActive]}>{y}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <Text style={[styles.pickerLabel, { marginTop: 12 }]}>Week</Text>
                    <ScrollView style={styles.dropdownList} nestedScrollEnabled>
                      {weekOptions.map((w) => (
                        <TouchableOpacity
                          key={w.key}
                          onPress={() => { Haptics.selectionAsync(); setSelectedWeek(w.key); }}
                          style={[styles.dropdownRow, selectedWeek === w.key && styles.topicRowActive]}
                        >
                          <Text style={[styles.topicText, selectedWeek === w.key && { color: theme.colors.primary, fontWeight: "600" }]}>
                            {w.label}
                          </Text>
                          {selectedWeek === w.key && <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {timeRange === "specific_month" && (
                  <View style={styles.pickerSection}>
                    <Text style={styles.pickerLabel}>Year</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearRow}>
                      {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                        <TouchableOpacity
                          key={y}
                          onPress={() => { Haptics.selectionAsync(); setFilterYear(y); setSelectedMonth(null); }}
                          style={[styles.yearChip, filterYear === y && styles.filterChipActive]}
                        >
                          <Text style={[styles.filterChipText, filterYear === y && styles.filterChipTextActive]}>{y}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                    <Text style={[styles.pickerLabel, { marginTop: 12 }]}>Month</Text>
                    <ScrollView style={styles.dropdownList} nestedScrollEnabled>
                      {monthOptions.map((m) => (
                        <TouchableOpacity
                          key={m.key}
                          onPress={() => { Haptics.selectionAsync(); setSelectedMonth(m.key); }}
                          style={[styles.dropdownRow, selectedMonth === m.key && styles.topicRowActive]}
                        >
                          <Text style={[styles.topicText, selectedMonth === m.key && { color: theme.colors.primary, fontWeight: "600" }]}>
                            {m.label}
                          </Text>
                          {selectedMonth === m.key && <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Text style={[styles.filterSection, { marginTop: 20 }]}>Topic</Text>
                <ScrollView
                  style={styles.topicList}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {TOPIC_OPTIONS.map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => { Haptics.selectionAsync(); setTopic(t); }}
                      style={[styles.topicRow, topic === t && styles.topicRowActive]}
                    >
                      <Text style={[styles.topicText, topic === t && { color: theme.colors.primary, fontWeight: "600" }]}>
                        {t}
                      </Text>
                      {topic === t && <Ionicons name="checkmark-circle" size={20} color={theme.colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                </ScrollView>

                <TouchableOpacity onPress={applyFilters} style={styles.applyBtn} activeOpacity={0.9}>
                  <Text style={styles.applyBtnText}>{t("planner.applyFilters")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* DETAILS OVERLAY — in-layout so header & bottom bar stay visible; same style as filter (dim + outlined sheet) */}
        {detailsModalVisible && (
          <View
            style={[
              StyleSheet.absoluteFillObject,
              { bottom: filterModalBottomPadding },
            ]}
            pointerEvents="box-none"
          >
            <View style={[StyleSheet.absoluteFill, styles.sheetDimOverlay]} />
            <Pressable style={StyleSheet.absoluteFill} onPress={closeDetails} />
            <View style={styles.filterSheetWrapper}>
              <Pressable style={[styles.detailsModalContent, styles.sheetPanel]} onPress={(e) => e.stopPropagation()}>
                {selectedItem && (
                <>
                  <View style={styles.detailsHeader}>
                    <Text style={styles.detailsTitle}>{selectedItem.title}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => { Haptics.selectionAsync(); setReminderModalVisible(true); }}
                        style={styles.detailsHeaderIconBtn}
                        hitSlop={12}
                        accessibilityLabel="Set reminders"
                      >
                        <Ionicons name="notifications-outline" size={22} color={theme.colors.primary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={closeDetails} hitSlop={12} accessibilityLabel="Close">
                        <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <ScrollView style={styles.detailsScroll} showsVerticalScrollIndicator={false}>
                    <View style={{ alignSelf: "flex-start", marginBottom: 12 }}>
                      <PlanCardBadge label={selectedItem.topic} variant="outlined" color={theme.colors.primary} />
                    </View>
                    <Text style={styles.detailsMeta}>{selectedItem.dateStr} · {selectedItem.timeLabel}</Text>
                    {selectedItem.location && (
                      <View style={styles.detailsRow}>
                        <Ionicons name="location-outline" size={18} color={theme.colors.textSecondary} style={{ marginRight: 8 }} />
                        <Text style={styles.detailsText}>{fmtLocationLine(selectedItem.location)}</Text>
                      </View>
                    )}
                    {selectedItem.description && (
                      <Text style={styles.detailsDescription}>{selectedItem.description}</Text>
                    )}
                    {selectedItem.source === "events" &&
                      selectedItem.participants &&
                      selectedItem.participants.filter((p) => p.id !== "me" && (p.firstName || p.occupation || p.city)).length > 0 && (
                      <View style={{ marginTop: 16 }}>
                        <Text style={styles.detailsSectionTitle}>Who&apos;s joining</Text>
                        {selectedItem.participants
                          .filter((p) => p.id !== "me")
                          .map((p) => ({
                            id: p.id,
                            firstName: p.firstName ?? "",
                            photoUrl: p.photoUrl,
                            birthday: p.birthday,
                            city: p.city,
                            occupation: p.occupation,
                            isOrganizer: p.isOrganizer,
                          }))
                          .map((info) => (
                            <EventParticipantCard
                              key={info.id}
                              participant={info}
                              onPress={() => {
                                const mode =
                                  selectedItem.source === "dates"
                                    ? "romance"
                                    : selectedItem.source === "meetups"
                                      ? "friends"
                                      : selectedItem.source === "business"
                                        ? "business"
                                        : "friends";
                                if (mode === "romance") router.push(`/(modes)/romance/profile-view?id=${info.id}`);
                                else router.push(`/(modes)/${mode}/profile-view?user_id=${info.id}`);
                              }}
                            />
                          ))}
                      </View>
                    )}
                    {isItemPast(selectedItem.dateStr) && selectedItem.fromConcierge ? (
                      <PlanRecommendationFeedback
                        planSummary={selectedItem.title}
                        mode={
                          selectedItem.source === "dates"
                            ? "romance"
                            : selectedItem.source === "meetups"
                              ? "friends"
                              : selectedItem.source === "business"
                                ? "business"
                                : "events"
                        }
                        aiRequestId={selectedItem.aiRequestId}
                        plannerItemId={selectedItem.id}
                        initialRating={selectedItem.recommendationFeedback ?? null}
                        label="Did this meet your expectations?"
                        compact
                      />
                    ) : null}
                    {isItemPast(selectedItem.dateStr) ? (
                      <Text style={styles.detailsHint}>This event has passed. It can no longer be managed.</Text>
                    ) : selectedItem.status === "archived" ? (
                      <Text style={styles.detailsHint}>
                        Canceled plans are kept in Archive for 2 weeks. Restore to bring this back to your planner.
                      </Text>
                    ) : !selectedItem.isOrganiser ? (
                      <Text style={styles.detailsHint}>
                        {t("planner.cancelNotifyHint", {
                          party:
                            selectedItem.source === "dates"
                              ? t("planner.cancelNotifyDate")
                              : selectedItem.source === "events"
                                ? t("planner.cancelNotifyOrganiser")
                                : t("planner.cancelNotifyOther"),
                        })}
                      </Text>
                    ) : null}
                  </ScrollView>
                  {!isItemPast(selectedItem.dateStr) && (
                    <View style={styles.detailsActions}>
                      {selectedItem.status === "archived" ? (
                        <TouchableOpacity
                          onPress={() => restoreItem(selectedItem)}
                          style={[styles.detailActionBtn, { flex: 1 }]}
                          accessibilityLabel="Restore"
                        >
                          <Ionicons name="arrow-undo" size={DETAIL_ACTION_ICON_CANCEL} color={theme.modeAccent("events").primary} />
                          <Text style={styles.detailActionLabel}>{t("planner.restore")}</Text>
                        </TouchableOpacity>
                      ) : (
                        <>
                          <TouchableOpacity
                            onPress={() => { Haptics.selectionAsync(); closeDetails(); }}
                            style={[styles.detailActionBtn, styles.detailActionBtnConfirm]}
                            accessibilityLabel="Confirm"
                          >
                            <Image source={require("@/assets/icons/confirm-icon.png")} style={{ width: DETAIL_ACTION_ICON_CONFIRM, height: DETAIL_ACTION_ICON_CONFIRM }} resizeMode="contain" />
                            <Text style={styles.detailActionLabel}>{t("planner.confirm")}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => { Haptics.selectionAsync(); closeDetails(); }}
                            style={[styles.detailActionBtn, styles.detailActionBtnReschedule]}
                            accessibilityLabel="Postpone or reschedule"
                          >
                            <Image source={require("@/assets/icons/reschedule-icon.png")} style={{ width: DETAIL_ACTION_ICON_RESCHEDULE, height: DETAIL_ACTION_ICON_RESCHEDULE }} resizeMode="contain" />
                            <Text style={styles.detailActionLabel}>{t("planner.reschedule")}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => { setDetailsModalVisible(false); openCancelModal(); }}
                            style={[styles.detailActionBtn, styles.detailActionBtnCancel]}
                            accessibilityLabel="Cancel"
                          >
                            <Image source={require("@/assets/icons/decline-icon.png")} style={{ width: DETAIL_ACTION_ICON_CANCEL, height: DETAIL_ACTION_ICON_CANCEL }} resizeMode="contain" />
                            <Text style={styles.detailActionLabel}>{t("planner.cancel")}</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}
                </>
              )}
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* CANCEL CONFIRMATION MODAL */}
      <Modal visible={cancelModalVisible} animationType="slide" transparent onRequestClose={closeCancelModal}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalOverlay}>
          <Pressable style={styles.modalOverlay} onPress={closeCancelModal}>
          <Pressable style={styles.cancelModalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.cancelModalTitle}>{t("planner.cancelModalTitle")}</Text>
              <Text style={styles.cancelModalSub}>{t("planner.cancelModalSub")}</Text>
              <Text style={styles.cancelLabel}>{t("planner.quickReply")}</Text>
              {CANCEL_RESPONSE_KEYS.map((key) => {
                const label = t(key);
                return (
                <TouchableOpacity
                  key={key}
                  onPress={() => { Haptics.selectionAsync(); setSelectedCancelResponse(label); setCancelCustomMessage(""); }}
                  style={[styles.cancelOptionRow, selectedCancelResponse === label && styles.cancelOptionActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.cancelOptionText, selectedCancelResponse === label && { color: theme.colors.primary, fontWeight: "600" }]}>{label}</Text>
                  {selectedCancelResponse === label && <Ionicons name="checkmark" size={20} color={theme.colors.primary} />}
                </TouchableOpacity>
              );})}
              <Text style={[styles.cancelLabel, { marginTop: 16 }]}>{t("planner.orWriteYourOwn")}</Text>
              <TextInput
                style={styles.cancelInput}
                placeholder={t("planner.addPersonalMessage")}
                placeholderTextColor={theme.colors.textMuted}
                value={cancelCustomMessage}
                onChangeText={(t) => { setCancelCustomMessage(t); setSelectedCancelResponse(null); }}
                multiline
                maxLength={200}
              />
              <View style={styles.cancelModalActions}>
                <TouchableOpacity
                  onPress={() => { closeCancelModal(); setDetailsModalVisible(true); }}
                  style={styles.cancelSecondaryBtn}
                  activeOpacity={0.9}
                >
                  <Text style={styles.cancelSecondaryText}>{t("planner.keepPlan")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmCancel} style={styles.cancelPrimaryBtn} activeOpacity={0.9}>
                  <Text style={styles.cancelPrimaryText}>{t("planner.cancelPlan")}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {selectedItem && (
        <EventReminderModal
          visible={reminderModalVisible}
          onClose={() => setReminderModalVisible(false)}
          itemId={selectedItem.id}
          title={selectedItem.title}
        />
      )}

    </View>
  );
});

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.colors.background },
    contentWrapper: { flex: 1 },
    filterSheetWrapper: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: "flex-end",
      paddingBottom: 0,
    },
    tabBar: {
      backgroundColor: theme.colors.surface,
      minHeight: 48,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      ...theme.elevation(1),
    },
    tabBarScroll: { flex: 1 },
    tabBarContent: {
      flexDirection: "row",
      gap: theme.spacing.sm,
      alignItems: "center",
    },
    tab: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radii.pill,
      minHeight: 36,
    },
    tabActive: {},
    tabLabel: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontSize: 13,
      color: theme.colors.textPrimary,
    },
    scroll: { flex: 1 },
    scrollContent: { padding: theme.spacing.xl, paddingBottom: theme.spacing.huge },
    savedIdeasRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radii.lg,
      padding: theme.spacing.md,
      marginBottom: theme.spacing.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    savedIdeasRowText: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      flex: 1,
      fontWeight: "600",
      color: theme.colors.textPrimary,
    },
    viewPromoWrap: { paddingTop: theme.spacing.lg },
    conciergePromoCard: {
      marginBottom: theme.spacing.lg,
      padding: theme.spacing.lg,
      borderRadius: theme.radii.lg,
      backgroundColor: theme.colors.primary + "14",
      borderWidth: 1,
      borderColor: theme.colors.primary + "44",
    },
    conciergePromoRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: theme.spacing.md,
    },
    conciergePromoAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      ...theme.elevation(1),
    },
    conciergePromoTextWrap: { flex: 1, minWidth: 0 },
    conciergePromoText: {
      ...theme.type.body,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.primary,
      fontWeight: "800",
      marginBottom: theme.spacing.xs,
    },
    conciergePromoSub: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
    },
    conciergePromoCta: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing.sm,
      marginTop: theme.spacing.md,
      marginLeft: 52,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.primary,
    },
    conciergePromoCtaText: {
      ...theme.type.button,
      fontFamily: theme.type.button.fontFamily,
      fontSize: 14,
      color: theme.colors.onPrimary,
    },
    cardActionBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },

    emptyState: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.spacing.massive,
    },
    emptyTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.xs,
    },
    emptySub: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
      textAlign: "center",
      maxWidth: 260,
    },

    detailsModalContent: {
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.xxl,
      paddingBottom: theme.spacing.huge,
      maxHeight: "90%",
      marginTop: "auto",
    },
    detailsHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: theme.spacing.lg,
    },
    detailsTitle: {
      ...theme.type.h2,
      fontFamily: theme.type.h2.fontFamily,
      color: theme.colors.textPrimary,
      flex: 1,
      paddingRight: theme.spacing.md,
    },
    detailsHeaderIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.backgroundMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    detailsScroll: { maxHeight: 200, marginBottom: theme.spacing.xl },
    detailsMeta: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      fontWeight: "600",
      marginBottom: theme.spacing.md,
    },
    detailsRow: { flexDirection: "row", alignItems: "center", marginBottom: theme.spacing.sm },
    detailsText: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textPrimary },
    detailsDescription: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
    detailsSectionTitle: {
      ...theme.type.h3,
      fontFamily: theme.type.h3.fontFamily,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.md,
    },
    detailsHint: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textMuted,
      marginTop: theme.spacing.lg,
      fontStyle: "italic",
    },
    detailsActions: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: theme.spacing.md,
      paddingTop: theme.spacing.xl,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    detailActionBtn: {
      flex: 1,
      minWidth: 0,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radii.md,
      backgroundColor: theme.colors.backgroundMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    detailActionBtnConfirm: {
      backgroundColor: theme.colors.primary + "12",
      borderColor: theme.colors.primary + "30",
    },
    detailActionBtnReschedule: {
      backgroundColor: theme.colors.backgroundMuted,
      borderColor: theme.colors.border,
    },
    detailActionBtnCancel: {
      backgroundColor: theme.colors.backgroundMuted,
      borderColor: theme.colors.border,
    },
    detailActionLabel: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: theme.spacing.xs,
      fontWeight: "600",
    },

    cancelModalContent: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: theme.spacing.xxl,
      paddingBottom: theme.spacing.huge,
      maxHeight: "85%",
      marginTop: "auto",
    },
    cancelModalTitle: {
      ...theme.type.h2,
      fontFamily: theme.type.h2.fontFamily,
      color: theme.colors.textPrimary,
      marginBottom: theme.spacing.sm,
    },
    cancelModalSub: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textSecondary,
      marginBottom: theme.spacing.xl,
    },
    cancelLabel: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      fontWeight: "600",
      marginBottom: theme.spacing.sm,
    },
    cancelOptionRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.sm,
      marginBottom: theme.spacing.sm,
    },
    cancelOptionActive: { backgroundColor: theme.colors.primary + "15", borderWidth: 1, borderColor: theme.colors.primary + "40" },
    cancelOptionText: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textPrimary, flex: 1 },
    cancelInput: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textPrimary,
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.sm,
      padding: theme.spacing.md,
      minHeight: 80,
      textAlignVertical: "top",
    },
    cancelModalActions: {
      flexDirection: "row",
      gap: theme.spacing.md,
      marginTop: theme.spacing.xxl,
    },
    cancelSecondaryBtn: {
      flex: 1,
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing.md,
      alignItems: "center",
    },
    cancelSecondaryText: { ...theme.type.button, fontFamily: theme.type.button.fontFamily, color: theme.colors.textPrimary },
    cancelPrimaryBtn: {
      flex: 1,
      backgroundColor: theme.modeAccent("romance").primary,
      borderRadius: theme.radii.md,
      paddingVertical: theme.spacing.md,
      alignItems: "center",
    },
    cancelPrimaryText: { ...theme.type.button, fontFamily: theme.type.button.fontFamily, color: "#FFFFFF" },

    modalOverlayWrapper: {
      flex: 1,
      justifyContent: "flex-end",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      justifyContent: "flex-end",
    },
    sheetDimOverlay: {
      backgroundColor: theme.colors.overlay,
    },
    sheetPanel: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...theme.elevation(3),
      overflow: "visible",
    },
    modalContent: {
      backgroundColor: theme.colors.surface,
      padding: theme.spacing.xxl,
      paddingBottom: theme.spacing.huge,
      maxHeight: "85%",
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: theme.spacing.xxl,
    },
    modalTitle: {
      ...theme.type.h2,
      fontFamily: theme.type.h2.fontFamily,
      color: theme.colors.textPrimary,
    },
    filterSection: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      fontWeight: "600",
      marginBottom: theme.spacing.md,
    },
    overviewRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginBottom: theme.spacing.lg },
    overviewChip: {
      minHeight: 44,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.backgroundMuted,
      justifyContent: "center",
      alignItems: "center",
    },
    filterRow: { marginBottom: theme.spacing.xxs, minHeight: 52 },
    filterRowContent: { paddingVertical: theme.spacing.xxs, alignItems: "center" },
    dateDisplayBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.md,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    dateDisplayText: {
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textPrimary,
      fontWeight: "500",
    },
    pickerSection: {
      marginTop: theme.spacing.lg,
      paddingTop: theme.spacing.lg,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    pickerLabel: {
      ...theme.type.caption,
      fontFamily: theme.type.caption.fontFamily,
      color: theme.colors.textSecondary,
      fontWeight: "600",
      marginBottom: theme.spacing.sm,
    },
    yearRow: { marginBottom: theme.spacing.xxs },
    yearChip: {
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.backgroundMuted,
      marginRight: theme.spacing.sm,
    },
    dropdownList: { maxHeight: 180 },
    dropdownRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: theme.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    filterChip: {
      minHeight: 44,
      paddingVertical: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      borderRadius: theme.radii.pill,
      backgroundColor: theme.colors.backgroundMuted,
      marginRight: theme.spacing.sm,
      justifyContent: "center",
      alignItems: "center",
    },
    filterChipActive: { backgroundColor: theme.colors.primary },
    filterChipText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, fontSize: 14, lineHeight: 20, color: theme.colors.textPrimary },
    filterChipTextActive: { color: theme.colors.onPrimary },
    topicList: { maxHeight: 200 },
    topicRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: theme.spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    topicRowActive: { backgroundColor: theme.colors.backgroundMuted },
    topicText: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textPrimary },
    applyBtn: {
      marginTop: theme.spacing.xxl,
      backgroundColor: theme.colors.primary,
      borderRadius: 16,
      paddingVertical: theme.spacing.md,
      alignItems: "center",
      ...theme.elevation(2),
    },
    applyBtnText: { ...theme.type.button, fontFamily: theme.type.button.fontFamily, color: theme.colors.onPrimary },
    weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    weekNavBtn: { padding: theme.spacing.xs },
    weekNavTitle: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, fontWeight: "600", color: theme.colors.textPrimary },
    weekStrip: { flexDirection: "row", paddingVertical: theme.spacing.md, paddingHorizontal: theme.spacing.xxs, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    weekDayCell: { flex: 1, alignItems: "center", paddingVertical: theme.spacing.sm, borderRadius: theme.radii.sm, marginHorizontal: 2 },
    weekDayToday: { backgroundColor: theme.colors.primary },
    weekDaySelected: { backgroundColor: theme.colors.primary + "18" },
    weekDayName: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.xs },
    weekDayNum: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, fontWeight: "700", color: theme.colors.textPrimary },
    weekDayTodayText: { color: theme.colors.onPrimary },
    weekDayBlock: { marginTop: theme.spacing.xxs, paddingTop: 3, borderTopWidth: 1, borderTopColor: theme.colors.border },
    weekDayBlockSelected: { borderTopColor: theme.colors.primary, borderTopWidth: 2 },
    weekDayBlockTitle: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, fontWeight: "600", color: theme.colors.textSecondary, marginBottom: theme.spacing.md },
    weekDayEmpty: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textMuted, fontStyle: "italic", marginBottom: theme.spacing.sm },
    monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: theme.spacing.sm, paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
    monthGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: theme.spacing.xxs, paddingTop: theme.spacing.md, paddingBottom: theme.spacing.xxs },
    monthWeekdayHeader: { width: "14.28%", textAlign: "center", ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textSecondary, fontWeight: "600", marginBottom: theme.spacing.sm },
    monthCell: { width: "14.28%", aspectRatio: 1, maxWidth: 48, maxHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, margin: 2 },
    monthCellToday: { backgroundColor: theme.colors.primary },
    monthCellSelected: { backgroundColor: theme.colors.primary + "20", borderWidth: 2, borderColor: theme.colors.primary },
    monthCellDay: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, fontWeight: "400", color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
    monthCellTodayText: { color: theme.colors.onPrimary },
    monthCellSelectedText: { color: theme.colors.primary, fontWeight: "600" },
    monthCellIndicator: { position: "absolute", bottom: 3, left: 0, right: 0, alignItems: "center", justifyContent: "center" },
    monthCellDotsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
    monthCellModeDot: { width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5, borderColor: "rgba(0,0,0,0.15)" },
    monthEvents: { marginTop: 0 },
    monthEventsDivider: { height: 1, backgroundColor: theme.colors.border, marginBottom: theme.spacing.xxs },
  });
}

export default PlannerIndex;
