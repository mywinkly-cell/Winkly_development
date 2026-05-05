// apps/mobile/app/planner/index.tsx
// Winkly – Planner Hub (v8.1)
// Top header: Filter | Winkly | Settings (PlannerHeader on all Planner screens)
// Tab bar: All | Dates | Meet-ups | Business | Events | Archive
// Content: Planned activities per active tab, filterable

import React, { useState, useMemo, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
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
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { Colors, Typography, Layout, FontFamily, Shadow } from "@/constants/tokens";
import { supabase } from "@/lib/supabase";
import { getSavedIdeas } from "@/lib/ai/conciergeStorage";
import {
  getProactiveSuggestion,
  getWeeklyWeekendSuggestion,
  shouldShowProactiveSuggestion,
  dismissSuggestion,
  dismissWeeklyWeekend,
  isWeekendIdeasPeriod,
  getWeeklyWeekendDismissedUntil,
  enrichProactiveSuggestion,
  scheduleSaturdayPlannerNudgeIfNeeded,
  type ProactiveSuggestion,
  type WeeklyWeekendSuggestion,
  type PlannerTabKey,
} from "@/lib/ai/proactiveSuggestion";
import { ProactiveSuggestionCard } from "@/components/planner/ProactiveSuggestionCard";
import { ProactiveSuggestionDetailModal } from "@/components/planner/ProactiveSuggestionDetailModal";
import { WeeklyWeekendCard } from "@/components/planner/WeeklyWeekendCard";
import { EventParticipantCard } from "@/components/ui/EventParticipantCard";
import { PlannerHeader } from "@/components/layout/PlannerHeader";
import { EventReminderModal } from "@/components/planner/EventReminderModal";
import type { Mode } from "@/types";
import { useFormatLocationDisplay } from "@/lib/location/useLocationDisplay";

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
  const [loadFailed, setLoadFailed] = useState(false);
  const showPlaceholder = !photoUrl || loadFailed;
  return (
    <View style={[avatarStyles.avatarWrap, { width: size, height: size, borderRadius: size / 2 }]}>
      {showPlaceholder ? (
        <View style={[avatarStyles.placeholderBg, { width: size, height: size, borderRadius: size / 2 }]}>
          <Ionicons name="person" size={size * 0.5} color={Colors.gray500} />
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

const TAB_CONFIG: { key: TabKey; label: string; accent: string; secondary: string }[] = [
  { key: "all", label: "All", accent: Colors.primaryViolet, secondary: Colors.white },
  { key: "dates", label: "Dates", accent: Colors.romance.primary, secondary: Colors.romance.secondary },
  { key: "meetups", label: "Meet-ups", accent: Colors.friends.primary, secondary: Colors.friends.secondary },
  { key: "business", label: "Business", accent: Colors.business.primary, secondary: Colors.business.secondary },
  { key: "events", label: "Events", accent: Colors.events.primary, secondary: Colors.events.secondary },
  { key: "archive", label: "Archive", accent: Colors.gray600, secondary: Colors.gray200 },
];

const CANCEL_STANDARD_RESPONSES = [
  "Something came up — I need to reschedule",
  "Unfortunately I can't make it this time",
  "Apologies — my schedule has changed",
  "I'd love to reconnect another time",
];

const TIME_RANGE_OPTIONS: { key: TimeRange; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "specific_day", label: "Pick a date" },
  { key: "this_week", label: "This week" },
  { key: "next_week", label: "Next week" },
  { key: "this_weekend", label: "This weekend" },
  { key: "next_weekend", label: "Next weekend" },
  { key: "specific_week", label: "Pick a week" },
  { key: "this_month", label: "This month" },
  { key: "next_month", label: "Next month" },
  { key: "specific_month", label: "Pick a month" },
];

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function getWeeksForYear(year: number): { key: string; label: string }[] {
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
    const startStr = `${MONTH_SHORT[weekStart.getMonth()]} ${weekStart.getDate()}`;
    const endStr = `${MONTH_SHORT[weekEnd.getMonth()]} ${weekEnd.getDate()}`;
    const label = `cw ${cw} ${startStr} - ${endStr}`;
    weeks.push({ key, label });
  }
  return weeks;
}

function getMonthsForYear(year: number): { key: string; label: string }[] {
  return MONTH_NAMES.map((name, i) => ({
    key: `${year}-${String(i + 1).padStart(2, "0")}`,
    label: `${name} ${year}`,
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

const INITIAL_ITEMS: PlannerItem[] = [
  { id: "d1", title: "Coffee date", timeLabel: "Fri • 18:30", dateStr: "31.01.2026", source: "dates", sortKey: 5.75, topic: "Coffee", description: "Casual coffee with a match.", location: "Café Blüte, Munich", isOrganiser: false, status: "active", participants: [{ id: "me", photoUrl: null }, { id: "date1", photoUrl: null }] },
  { id: "d2", title: "Dinner reservation", timeLabel: "Sat • 20:00", dateStr: "01.02.2026", source: "dates", sortKey: 6.83, topic: "Dining", description: "Dinner at the Italian place.", location: "Trattoria Bella", isOrganiser: true, status: "active", participants: [{ id: "me", photoUrl: null }, { id: "date2", photoUrl: null }] },
  { id: "d3", title: "Walk in park", timeLabel: "Sun • 14:00", dateStr: "02.02.2026", source: "dates", sortKey: 7.58, topic: "Outdoors", description: "Afternoon walk.", location: "Englischer Garten", isOrganiser: false, status: "active", participants: [{ id: "me", photoUrl: null }, { id: "date3", photoUrl: null }] },
  { id: "f1", title: "Reggaeton class", timeLabel: "Wed • 19:00", dateStr: "29.01.2026", source: "meetups", sortKey: 3.79, topic: "Dancing", description: "Beginner-friendly reggaeton class.", location: "Dance Studio Munich", isOrganiser: false, status: "active", participants: [{ id: "me", photoUrl: null }, { id: "friend1", photoUrl: null }] },
  { id: "f2", title: "Brunch with new friend", timeLabel: "Sat • 11:30", dateStr: "01.02.2026", source: "meetups", sortKey: 6.48, topic: "Dining", description: "Sunday brunch.", location: "Brunch & Coffee", isOrganiser: true, status: "active", participants: [{ id: "me", photoUrl: null }, { id: "friend2", photoUrl: null }] },
  { id: "f3", title: "Hiking group meetup", timeLabel: "Sun • 09:00", dateStr: "02.02.2026", source: "meetups", sortKey: 7.38, topic: "Outdoors", description: "Morning hike with the group.", location: "Isar Trail", isOrganiser: false, status: "active", participants: [{ id: "me", photoUrl: null }, { id: "g1", photoUrl: null }, { id: "g2", photoUrl: null }, { id: "g3", photoUrl: null }, { id: "g4", photoUrl: null }] },
  { id: "b1", title: "Intro call — Product Manager", timeLabel: "Mon • 10:00", dateStr: "27.01.2026", source: "business", sortKey: 1.42, topic: "Business meetings", description: "Initial intro call.", location: "Video call", isOrganiser: false, status: "active", participants: [{ id: "me", photoUrl: null }, { id: "pm1", photoUrl: null }] },
  { id: "b2", title: "Coffee — Startup founder", timeLabel: "Thu • 16:30", dateStr: "30.01.2026", source: "business", sortKey: 4.69, topic: "Coffee", description: "Networking coffee chat.", location: "Werksviertel Café", isOrganiser: true, status: "active", participants: [{ id: "me", photoUrl: null }, { id: "founder", photoUrl: null }] },
  { id: "b3", title: "Partnership meeting", timeLabel: "Fri • 13:00", dateStr: "31.01.2026", source: "business", sortKey: 5.54, topic: "Business meetings", description: "Discuss partnership terms.", location: "Office", isOrganiser: false, status: "active", participants: [{ id: "me", photoUrl: null }, { id: "p1", photoUrl: null }, { id: "p2", photoUrl: null }, { id: "p3", photoUrl: null }] },
  {
    id: "e1",
    title: "Latin night — Munich",
    timeLabel: "Sat • 22:00",
    dateStr: "01.02.2026",
    source: "events",
    sortKey: 6.92,
    topic: "Dancing",
    description: "Latin dance night at the club.",
    location: "P1 Club, Munich",
    isOrganiser: false,
    status: "active",
    participants: [
      { id: "me", photoUrl: null },
      { id: "e1-host", photoUrl: null, firstName: "Maria", birthday: "1990-05-15", city: "Munich", occupation: "Dance instructor", isOrganizer: true },
      { id: "e1a", photoUrl: null, firstName: "Alex", birthday: "1992-08-20", city: "Munich", occupation: "Software dev" },
      { id: "e1b", photoUrl: null, firstName: "Sofia", birthday: "1995-03-10", city: "Munich", occupation: "Designer" },
    ],
  },
  {
    id: "e2",
    title: "Startup meetup",
    timeLabel: "Thu • 18:30",
    dateStr: "30.01.2026",
    source: "events",
    sortKey: 4.77,
    topic: "Networking",
    description: "Monthly startup networking.",
    location: "Factory Munich",
    isOrganiser: false,
    status: "active",
    participants: [
      { id: "me", photoUrl: null },
      { id: "e2-host", photoUrl: null, firstName: "Tom", birthday: "1988-01-22", city: "Munich", occupation: "Startup founder", isOrganizer: true },
      { id: "e2a", photoUrl: null, firstName: "Lisa", birthday: "1991-11-05", city: "Munich", occupation: "PM" },
      { id: "e2b", photoUrl: null, firstName: "Jon", birthday: "1985-07-30", city: "Munich", occupation: "Investor" },
    ],
  },
  {
    id: "e3",
    title: "Art exhibition",
    timeLabel: "Sun • 12:00",
    dateStr: "02.02.2026",
    source: "events",
    sortKey: 7.5,
    topic: "Arts & Culture",
    description: "Contemporary art exhibition.",
    location: "Pinakothek der Moderne",
    isOrganiser: false,
    status: "active",
    participants: [
      { id: "me", photoUrl: null },
      { id: "e3-host", photoUrl: null, firstName: "Clara", birthday: "1989-04-18", city: "Munich", occupation: "Curator", isOrganizer: true },
      { id: "e3a", photoUrl: null, firstName: "Max", birthday: "1993-09-12", city: "Munich", occupation: "Artist" },
    ],
  },
];

function ParticipantAvatars({
  participants,
  source,
  myPhotoBySource,
}: {
  participants: Participant[];
  source?: TabKey;
  myPhotoBySource?: Partial<Record<TabKey, string | null>>;
}) {
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

const avatarStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  avatarWrap: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 2,
    borderColor: Colors.white,
    overflow: "hidden",
    backgroundColor: Colors.gray200,
    ...Shadow.card,
  },
  avatar: { width: "100%", height: "100%" },
  placeholderBg: {
    backgroundColor: Colors.gray200,
    alignItems: "center",
    justifyContent: "center",
  },
  extraBadge: {
    backgroundColor: Colors.gray400,
    alignItems: "center",
    justifyContent: "center",
  },
  extraText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: "700",
  },
});

const ARCHIVE_DAYS = 14;

type PlannerIndexProps = {
  /** When true, hides top header (Back/Filters/Settings) for use inside mode-selection etc. */
  embedded?: boolean;
  /** Initial tab when opened from a mode (e.g. Romance → dates, Friends → meetups). */
  initialTab?: TabKey;
};

export type PlannerIndexHandle = {
  openFilter: () => void;
  openConcierge: () => void;
};

const BOTTOM_BAR_HEIGHT = Layout.bottomBarHeight ?? 76;

const PlannerIndex = forwardRef<PlannerIndexHandle, PlannerIndexProps>(function PlannerIndex({ embedded, initialTab }, ref) {
  const router = useRouter();
  const fmtLocationLine = useFormatLocationDisplay();
  const insets = useSafeAreaInsets();
  const filterModalBottomPadding = BOTTOM_BAR_HEIGHT + insets.bottom;
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
  const [viewedMonth, setViewedMonth] = useState<Date>(() => new Date());
  const [selectedMonthDay, setSelectedMonthDay] = useState<string | null>(null);
  const [savedIdeasCount, setSavedIdeasCount] = useState(0);
  const [proactiveSuggestion, setProactiveSuggestion] = useState<ProactiveSuggestion | null>(null);
  const [showProactiveCard, setShowProactiveCard] = useState(false);
  const [suggestionDetailModalVisible, setSuggestionDetailModalVisible] = useState(false);
  const [suggestionForDetail, setSuggestionForDetail] = useState<ProactiveSuggestion | null>(null);
  const [weeklySuggestion, setWeeklySuggestion] = useState<WeeklyWeekendSuggestion | null>(null);
  const [showWeeklyCard, setShowWeeklyCard] = useState(false);

  useEffect(() => {
    setSelectedMonthDay(null);
  }, [viewedMonth]);

  useEffect(() => {
    getSavedIdeas().then((ideas) => setSavedIdeasCount(ideas.length));
  }, []);

  useFocusEffect(
    useCallback(() => {
      getSavedIdeas().then((ideas) => setSavedIdeasCount(ideas.length));
      void scheduleSaturdayPlannerNudgeIfNeeded();
      (async () => {
        if (activeTab === "archive") return;
        const [showProactive, weeklyDismissed] = await Promise.all([
          shouldShowProactiveSuggestion(),
          getWeeklyWeekendDismissedUntil(),
        ]);
        const now = Date.now();
        const inWeekendPeriod = isWeekendIdeasPeriod();
        if (inWeekendPeriod && (weeklyDismissed == null || now > weeklyDismissed)) {
          setWeeklySuggestion(getWeeklyWeekendSuggestion());
          setShowWeeklyCard(true);
          setProactiveSuggestion(null);
          setShowProactiveCard(false);
        } else if (showProactive) {
          const raw = getProactiveSuggestion(activeTab as PlannerTabKey);
          const suggestion = await enrichProactiveSuggestion(raw, activeTab as PlannerTabKey);
          setProactiveSuggestion(suggestion);
          setShowProactiveCard(!!suggestion);
          setWeeklySuggestion(null);
          setShowWeeklyCard(false);
        } else {
          setProactiveSuggestion(null);
          setShowProactiveCard(false);
          setWeeklySuggestion(null);
          setShowWeeklyCard(false);
        }
      })();
    }, [activeTab])
  );

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

  const weekOptions = useMemo(() => getWeeksForYear(filterYear), [filterYear]);
  const monthOptions = useMemo(() => getMonthsForYear(filterYear), [filterYear]);

  const onTabPress = (key: TabKey) => {
    Haptics.selectionAsync();
    setActiveTab(key);
  };

  const onFiltersPress = useCallback(() => {
    Haptics.selectionAsync();
    setFilterModalVisible(true);
  }, []);

  const openConcierge = useCallback(() => {
    const modeParam = activeTab === "dates" ? "romance" : activeTab === "meetups" ? "friends" : activeTab === "business" ? "business" : "events";
    const tabParam = activeTab === "archive" ? "all" : activeTab;
    router.push({ pathname: "/concierge", params: { source_screen: "planner", mode: modeParam, source_planner_tab: tabParam } });
  }, [activeTab, router]);

  const openConciergeWithProactive = useCallback(
    (suggestion: ProactiveSuggestion, step: "activity" | "social") => {
      const modeParam = activeTab === "dates" ? "romance" : activeTab === "meetups" ? "friends" : activeTab === "business" ? "business" : "events";
      const tabParam = activeTab === "archive" ? "all" : activeTab;
      const params: Record<string, string | undefined> = {
        source_screen: "planner",
        mode: modeParam,
        source_planner_tab: tabParam,
        initial_step: step,
        proactive_activity_label: suggestion.activityHint ?? suggestion.title,
        proactive_date_preset: suggestion.datePreset ?? "today",
        proactive_time_of_day: suggestion.timeOfDay ?? undefined,
      };
      if (step === "social" && suggestion.partner_user_id && suggestion.partner_display_name) {
        params.partner_user_id = suggestion.partner_user_id;
        params.partner_display_name = suggestion.partner_display_name;
      }
      router.push({
        pathname: "/concierge",
        params,
      });
    },
    [activeTab, router]
  );

  const handleProactiveDismiss = useCallback(async () => {
    await dismissSuggestion();
    setShowProactiveCard(false);
    setProactiveSuggestion(null);
  }, []);

  const handleWeeklyDismiss = useCallback(async () => {
    await dismissWeeklyWeekend();
    setShowWeeklyCard(false);
    setWeeklySuggestion(null);
  }, []);

  useImperativeHandle(ref, () => ({ openFilter: onFiltersPress, openConcierge }), [onFiltersPress, openConcierge]);

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
    closeDetails();
  }, [closeDetails]);

  const confirmCancel = useCallback(() => {
    if (!selectedItem) return;
    const msg = cancelCustomMessage.trim() || selectedCancelResponse || "I won't be able to make it.";
    Haptics.selectionAsync();
    archiveItem(selectedItem, msg);
  }, [selectedItem, cancelCustomMessage, selectedCancelResponse, archiveItem]);

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
      : itemsState.filter((it) => it.status === "active" && (activeTab === "all" || it.source === activeTab));

    if (topic !== "All topics") {
      list = list.filter((it) => it.topic === topic);
    }

    if (!isArchiveTab && !isPastContext) {
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
  }, [activeTab, timeRange, topic, itemsState, listSortOrder, isPastContext, todayStart]);

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

  const _accentColor = TAB_CONFIG.find((t) => t.key === activeTab)?.accent ?? Colors.primaryViolet;

  const renderItemCard = useCallback((it: PlannerItem) => {
    const past = isItemPast(it.dateStr);
    return (
      <View key={it.id} style={[styles.itemCard, past && styles.itemCardPast]}>
        <View style={styles.itemCardRow}>
          <TouchableOpacity onPress={() => openDetails(it)} activeOpacity={0.85} style={styles.itemCardContent} accessibilityLabel={`${it.title}, ${it.dateStr}`}>
            <View style={styles.itemTop}>
              <Text style={[styles.dateLabel, past && styles.dateLabelPast]}>{it.dateStr}</Text>
              {past && (
                <View style={styles.pastChip}>
                  <Text style={styles.pastChipText}>Past</Text>
                </View>
              )}
            </View>
            <View style={styles.itemTitleRow}>
              {/* Color by item's mode (source) so All tab shows dates/meetups/business/events each with their own color */}
              <View style={[styles.sourceDot, { backgroundColor: TAB_CONFIG.find((t) => t.key === it.source)?.accent ?? Colors.primaryViolet }]} />
              <Text style={[styles.itemTitle, past && styles.itemTitlePast]}>{it.title}</Text>
            </View>
            <View style={styles.topicChip}>
              <Text style={styles.topicChipText}>{it.topic}</Text>
            </View>
            <Text style={[styles.itemSub, past && styles.itemSubPast]}>{it.timeLabel}</Text>
          </TouchableOpacity>
          <View style={styles.cardRightColumn}>
            <View style={styles.cardAvatarsWrap}>
              <ParticipantAvatars participants={it.participants ?? []} source={it.source} myPhotoBySource={myPhotoBySource} />
            </View>
            {!past && (
              <View style={styles.cardActions}>
                {it.status === "archived" ? (
                  <TouchableOpacity onPress={() => { Haptics.selectionAsync(); restoreItem(it); }} style={styles.cardActionBtn} hitSlop={12} accessibilityLabel="Restore">
                    <Ionicons name="arrow-undo" size={CARD_ACTION_ICON_CANCEL} color={Colors.events.primary} />
                  </TouchableOpacity>
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
        </View>
      </View>
    );
  }, [openDetails, restoreItem, myPhotoBySource, openCancelModal]);

  return (
    <View style={styles.screen}>
      {/* TOP HEADER — Filter | Winkly | optional AI Spark (no profile/settings; those only at Mode Selection) */}
      {!embedded && (
        <PlannerHeader onFilterPress={onFiltersPress} onAIPress={openConcierge} />
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
            const bgColor = tab.key === "all" ? Colors.white : tab.secondary;
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
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
          </ScrollView>
        </View>

        {/* MAIN CONTENT */}
        <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 40 + filterModalBottomPadding }]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab !== "archive" && showWeeklyCard && weeklySuggestion && (
          <WeeklyWeekendCard
            suggestion={weeklySuggestion}
            onViewPlans={openConcierge}
            onDismiss={handleWeeklyDismiss}
          />
        )}
        {activeTab !== "archive" && showProactiveCard && proactiveSuggestion && (
          <ProactiveSuggestionCard
            suggestion={proactiveSuggestion}
            accentColor={TAB_CONFIG.find((t) => t.key === activeTab)?.accent ?? Colors.primaryViolet}
            onViewPlan={() => {
              setSuggestionForDetail(proactiveSuggestion);
              setSuggestionDetailModalVisible(true);
            }}
            onInviteSomeone={() => openConciergeWithProactive(proactiveSuggestion, "social")}
            onDismiss={handleProactiveDismiss}
          />
        )}
        {suggestionForDetail && (
          <ProactiveSuggestionDetailModal
            visible={suggestionDetailModalVisible}
            suggestion={suggestionForDetail}
            accentColor={TAB_CONFIG.find((t) => t.key === activeTab)?.accent ?? Colors.primaryViolet}
            onAddToPlanner={(s) => openConciergeWithProactive(s, "activity")}
            onInviteSomeone={(s) => openConciergeWithProactive(s, "social")}
            onDismiss={() => {
              setSuggestionDetailModalVisible(false);
              setSuggestionForDetail(null);
            }}
          />
        )}
        {savedIdeasCount > 0 && (
          <TouchableOpacity
            style={styles.savedIdeasRow}
            onPress={() => { Haptics.selectionAsync(); openConcierge(); }}
            activeOpacity={0.8}
          >
            <Ionicons name="bookmark" size={20} color={Colors.primaryViolet} />
            <Text style={styles.savedIdeasRowText}>Saved ideas ({savedIdeasCount})</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray500} />
          </TouchableOpacity>
        )}
        {overviewMode === "list" && (
          <>
            {items.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name={activeTab === "archive" ? "archive-outline" : "calendar-outline"} size={48} color={Colors.gray400} style={{ marginBottom: 12 }} />
                <Text style={styles.emptyTitle}>{activeTab === "archive" ? "No archived plans" : "No plans yet"}</Text>
                <Text style={styles.emptySub}>{activeTab === "archive" ? "Canceled plans appear here for 2 weeks. You can restore them anytime." : "Your upcoming plans will show up here."}</Text>
              </View>
            ) : items.map((it) => renderItemCard(it))}
          </>
        )}

        {overviewMode === "week" && (
          <>
            <View style={styles.weekNav}>
              <TouchableOpacity onPress={() => { Haptics.selectionAsync(); const prev = new Date(viewedWeekStart); prev.setDate(prev.getDate() - 7); setViewedWeekStart(prev); }} style={styles.weekNavBtn} hitSlop={12}>
                <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.weekNavTitle}>
                {MONTH_SHORT[viewedWeekStart.getMonth()]} {viewedWeekStart.getDate()} – {MONTH_SHORT[weekDays[6].getMonth()]} {weekDays[6].getDate()}, {viewedWeekStart.getFullYear()}
              </Text>
              <TouchableOpacity onPress={() => { Haptics.selectionAsync(); const next = new Date(viewedWeekStart); next.setDate(next.getDate() + 7); setViewedWeekStart(next); }} style={styles.weekNavBtn} hitSlop={12}>
                <Ionicons name="chevron-forward" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.weekStrip}>
              {weekDays.map((d) => {
                const isToday = isSameDay(d, today);
                return (
                  <View key={dayKey(d)} style={[styles.weekDayCell, isToday && styles.weekDayToday]}>
                    <Text style={[styles.weekDayName, isToday && styles.weekDayTodayText]}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d.getDay() === 0 ? 6 : d.getDay() - 1]}</Text>
                    <Text style={[styles.weekDayNum, isToday && styles.weekDayTodayText]}>{d.getDate()}</Text>
                  </View>
                );
              })}
            </View>
            {items.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color={Colors.gray400} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>No plans in this week</Text>
              <Text style={styles.emptySub}>Your events will show here.</Text>
            </View>
          ) : weekDays.map((d) => {
              const dayItems = itemsByDayWeek[dayKey(d)] ?? [];
              return (
                <View key={dayKey(d)} style={styles.weekDayBlock}>
                  <Text style={styles.weekDayBlockTitle}>{d.getDate()} {MONTH_SHORT[d.getMonth()]}</Text>
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
                <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.weekNavTitle}>{MONTH_NAMES[viewedMonth.getMonth()]} {viewedMonth.getFullYear()}</Text>
              <TouchableOpacity onPress={() => { Haptics.selectionAsync(); const next = new Date(viewedMonth.getFullYear(), viewedMonth.getMonth() + 1); setViewedMonth(next); }} style={styles.weekNavBtn} hitSlop={12}>
                <Ionicons name="chevron-forward" size={24} color={Colors.textPrimary} />
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
                                { backgroundColor: TAB_CONFIG.find((t) => t.key === src)?.accent ?? Colors.primaryViolet },
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
            {items.length === 0 ? (
              <View style={styles.monthEvents}>
                <View style={styles.monthEventsDivider} />
                <View style={styles.emptyState}>
                  <Ionicons name="calendar-outline" size={48} color={Colors.gray400} style={{ marginBottom: 12 }} />
                  <Text style={styles.emptyTitle}>No plans this month</Text>
                  <Text style={styles.emptySub}>Nothing planned yet.{"\n"}Let&apos;s turn this date into something worth remembering.</Text>
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
                        {d && <Text style={styles.weekDayBlockTitle}>{d.getDate()} {MONTH_SHORT[d.getMonth()]}</Text>}
                        {dayItems.length === 0 ? (
                          <View style={styles.emptyState}>
                            <Ionicons name="calendar-outline" size={48} color={Colors.gray400} style={{ marginBottom: 12 }} />
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
                        <Text style={styles.weekDayBlockTitle}>{d.getDate()} {MONTH_SHORT[d.getMonth()]}</Text>
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
                  <Text style={styles.modalTitle}>Filters & Views</Text>
                  <TouchableOpacity onPress={() => setFilterModalVisible(false)} hitSlop={12}>
                    <Ionicons name="close" size={24} color={Colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  contentContainerStyle={{ paddingBottom: 16 }}
                >
                  <Text style={styles.filterSection}>Overview</Text>
                  <View style={styles.overviewRow}>
                    {(["list", "week", "month"] as const).map((mode) => (
                      <TouchableOpacity
                        key={mode}
                        onPress={() => { Haptics.selectionAsync(); setOverviewMode(mode); }}
                        style={[styles.overviewChip, overviewMode === mode && styles.filterChipActive]}
                      >
                        <Text style={[styles.filterChipText, overviewMode === mode && styles.filterChipTextActive]}>
                          {mode === "list" ? "List" : mode === "week" ? "Week" : "Month"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.filterSection}>Sort (list)</Text>
                  <View style={styles.overviewRow}>
                    {(["earliest", "latest"] as const).map((order) => (
                      <TouchableOpacity
                        key={order}
                        onPress={() => { Haptics.selectionAsync(); setListSortOrder(order); }}
                        style={[styles.overviewChip, listSortOrder === order && styles.filterChipActive]}
                      >
                        <Text style={[styles.filterChipText, listSortOrder === order && styles.filterChipTextActive]}>
                          {order === "earliest" ? "Earliest first" : "Latest first"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.filterSection}>Time range</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.filterRow}
                    contentContainerStyle={styles.filterRowContent}
                    keyboardShouldPersistTaps="handled"
                  >
                    {TIME_RANGE_OPTIONS.map((opt) => (
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
                          {opt.label}
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
                        {selectedDate.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                      </Text>
                      <Ionicons name={showDatePicker ? "chevron-up" : "calendar-outline"} size={20} color={Colors.primaryViolet} />
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
                          <Text style={[styles.topicText, selectedWeek === w.key && { color: Colors.primaryViolet, fontWeight: "600" }]}>
                            {w.label}
                          </Text>
                          {selectedWeek === w.key && <Ionicons name="checkmark-circle" size={20} color={Colors.primaryViolet} />}
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
                          <Text style={[styles.topicText, selectedMonth === m.key && { color: Colors.primaryViolet, fontWeight: "600" }]}>
                            {m.label}
                          </Text>
                          {selectedMonth === m.key && <Ionicons name="checkmark-circle" size={20} color={Colors.primaryViolet} />}
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
                      <Text style={[styles.topicText, topic === t && { color: Colors.primaryViolet, fontWeight: "600" }]}>
                        {t}
                      </Text>
                      {topic === t && <Ionicons name="checkmark-circle" size={20} color={Colors.primaryViolet} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                </ScrollView>

                <TouchableOpacity onPress={applyFilters} style={styles.applyBtn} activeOpacity={0.9}>
                  <Text style={styles.applyBtnText}>Apply filters</Text>
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
                        <Ionicons name="notifications-outline" size={22} color={Colors.primaryViolet} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={closeDetails} hitSlop={12} accessibilityLabel="Close">
                        <Ionicons name="close" size={24} color={Colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <ScrollView style={styles.detailsScroll} showsVerticalScrollIndicator={false}>
                    <View style={[styles.topicChip, { marginBottom: 12 }]}>
                      <Text style={styles.topicChipText}>{selectedItem.topic}</Text>
                    </View>
                    <Text style={styles.detailsMeta}>{selectedItem.dateStr} · {selectedItem.timeLabel}</Text>
                    {selectedItem.location && (
                      <View style={styles.detailsRow}>
                        <Ionicons name="location-outline" size={18} color={Colors.gray600} style={{ marginRight: 8 }} />
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
                    {isItemPast(selectedItem.dateStr) ? (
                      <Text style={styles.detailsHint}>This event has passed. It can no longer be managed.</Text>
                    ) : selectedItem.status === "archived" ? (
                      <Text style={styles.detailsHint}>
                        Canceled plans are kept in Archive for 2 weeks. Restore to bring this back to your planner.
                      </Text>
                    ) : !selectedItem.isOrganiser ? (
                      <Text style={styles.detailsHint}>
                        {selectedItem.source === "dates" ? "Your date" : selectedItem.source === "events" ? "Event organiser" : "The other party"} will be notified if you cancel or reschedule.
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
                          <Ionicons name="arrow-undo" size={DETAIL_ACTION_ICON_CANCEL} color={Colors.events.primary} />
                          <Text style={styles.detailActionLabel}>Restore</Text>
                        </TouchableOpacity>
                      ) : (
                        <>
                          <TouchableOpacity
                            onPress={() => { Haptics.selectionAsync(); closeDetails(); }}
                            style={[styles.detailActionBtn, styles.detailActionBtnConfirm]}
                            accessibilityLabel="Confirm"
                          >
                            <Image source={require("@/assets/icons/confirm-icon.png")} style={{ width: DETAIL_ACTION_ICON_CONFIRM, height: DETAIL_ACTION_ICON_CONFIRM }} resizeMode="contain" />
                            <Text style={styles.detailActionLabel}>Confirm</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => { Haptics.selectionAsync(); closeDetails(); }}
                            style={[styles.detailActionBtn, styles.detailActionBtnReschedule]}
                            accessibilityLabel="Postpone or reschedule"
                          >
                            <Image source={require("@/assets/icons/reschedule-icon.png")} style={{ width: DETAIL_ACTION_ICON_RESCHEDULE, height: DETAIL_ACTION_ICON_RESCHEDULE }} resizeMode="contain" />
                            <Text style={styles.detailActionLabel}>Reschedule</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => { setDetailsModalVisible(false); openCancelModal(); }}
                            style={[styles.detailActionBtn, styles.detailActionBtnCancel]}
                            accessibilityLabel="Cancel"
                          >
                            <Image source={require("@/assets/icons/decline-icon.png")} style={{ width: DETAIL_ACTION_ICON_CANCEL, height: DETAIL_ACTION_ICON_CANCEL }} resizeMode="contain" />
                            <Text style={styles.detailActionLabel}>Cancel</Text>
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
            <Text style={styles.cancelModalTitle}>Cancel this plan?</Text>
              <Text style={styles.cancelModalSub}>
                The other party will be notified. You can add a message (optional). Canceled items are kept in Archive for 2 weeks.
              </Text>
              <Text style={styles.cancelLabel}>Quick reply</Text>
              {CANCEL_STANDARD_RESPONSES.map((r) => (
                <TouchableOpacity
                  key={r}
                  onPress={() => { Haptics.selectionAsync(); setSelectedCancelResponse(r); setCancelCustomMessage(""); }}
                  style={[styles.cancelOptionRow, selectedCancelResponse === r && styles.cancelOptionActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.cancelOptionText, selectedCancelResponse === r && { color: Colors.primaryViolet, fontWeight: "600" }]}>{r}</Text>
                  {selectedCancelResponse === r && <Ionicons name="checkmark" size={20} color={Colors.primaryViolet} />}
                </TouchableOpacity>
              ))}
              <Text style={[styles.cancelLabel, { marginTop: 16 }]}>Or write your own</Text>
              <TextInput
                style={styles.cancelInput}
                placeholder="Add a personal message..."
                placeholderTextColor={Colors.gray500}
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
                  <Text style={styles.cancelSecondaryText}>Keep plan</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={confirmCancel} style={styles.cancelPrimaryBtn} activeOpacity={0.9}>
                  <Text style={styles.cancelPrimaryText}>Cancel plan</Text>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.backgroundLight },
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
    backgroundColor: Colors.white,
    minHeight: 48,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  tabBarScroll: { flex: 1 },
  tabBarContent: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    minHeight: 36,
  },
  tabActive: {},
  tabLabel: {
    ...Typography.caption,
    fontSize: 13,
    color: Colors.textPrimary,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  savedIdeasRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  savedIdeasRowText: {
    ...Typography.body,
    flex: 1,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  itemCard: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    borderWidth: 1,
    borderColor: Colors.gray200,
    padding: 20,
    marginBottom: 16,
    minHeight: 168,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  itemCardPast: { opacity: 0.92, borderColor: Colors.gray300 },
  itemCardRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 128,
    flex: 1,
  },
  itemCardContent: { flex: 1, marginRight: 16, minWidth: 0 },
  cardRightColumn: {
    alignItems: "flex-end",
    justifyContent: "space-between",
    minWidth: 110,
    alignSelf: "stretch",
    minHeight: 128,
  },
  cardAvatarsWrap: { flexShrink: 0, marginBottom: 16 },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 8,
    marginRight: -4,
    marginBottom: -11,
  },
  cardActionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
    shadowColor: "#1C1C1E",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 4,
  },
  itemTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 5,
  },
  dateLabel: {
    fontSize: 12,
    lineHeight: 15,
    color: Colors.gray600,
    fontWeight: "600",
  },
  dateLabelPast: { color: Colors.gray500 },
  pastChip: {
    backgroundColor: Colors.gray200,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  pastChipText: { fontSize: 11, fontWeight: "600", color: Colors.gray600 },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 5,
  },
  sourceDot: { width: 7, height: 7, borderRadius: 4, marginRight: 7 },
  itemTitle: { fontSize: 14, lineHeight: 19, fontWeight: "600", color: Colors.textPrimary, flex: 1 },
  itemTitlePast: { color: Colors.gray600 },
  itemSubPast: { color: Colors.gray500 },
  topicChip: {
    alignSelf: "flex-start",
    backgroundColor: Colors.backgroundMuted,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 11,
    marginBottom: 5,
  },
  topicChipText: {
    fontSize: 12,
    lineHeight: 15,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  itemSub: { fontSize: 13, lineHeight: 18, color: Colors.gray700 },

  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
  },
  emptyTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  emptySub: {
    ...Typography.body,
    color: Colors.gray600,
    textAlign: "center",
    maxWidth: 260,
  },

  detailsModalContent: {
    backgroundColor: Colors.white,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "90%",
    marginTop: "auto",
  },
  detailsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  detailsTitle: {
    ...Typography.h2,
    color: Colors.textPrimary,
    fontFamily: FontFamily.heading,
    flex: 1,
    paddingRight: 12,
  },
  detailsHeaderIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  detailsScroll: { maxHeight: 200, marginBottom: 20 },
  detailsMeta: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "600",
    marginBottom: 12,
  },
  detailsRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  detailsText: { ...Typography.body, color: Colors.textPrimary },
  detailsDescription: { ...Typography.body, color: Colors.gray700, marginTop: 8 },
  detailsSectionTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    fontFamily: FontFamily.heading,
    marginBottom: 12,
  },
  detailsHint: {
    ...Typography.caption,
    color: Colors.gray500,
    marginTop: 16,
    fontStyle: "italic",
  },
  detailsActions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  detailActionBtn: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: Layout.radii.control,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  detailActionBtnConfirm: {
    backgroundColor: Colors.primaryViolet + "12",
    borderColor: Colors.primaryViolet + "30",
  },
  detailActionBtnReschedule: {
    backgroundColor: Colors.gray100,
    borderColor: Colors.gray200,
  },
  detailActionBtnCancel: {
    backgroundColor: Colors.gray100,
    borderColor: Colors.gray200,
  },
  detailActionLabel: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.gray700,
    marginTop: 6,
    fontWeight: "600",
  },

  cancelModalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "85%",
    marginTop: "auto",
  },
  cancelModalTitle: {
    ...Typography.h2,
    color: Colors.textPrimary,
    fontFamily: FontFamily.heading,
    marginBottom: 8,
  },
  cancelModalSub: {
    ...Typography.body,
    color: Colors.gray600,
    marginBottom: 20,
  },
  cancelLabel: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "600",
    marginBottom: 8,
  },
  cancelOptionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    marginBottom: 8,
  },
  cancelOptionActive: { backgroundColor: Colors.primaryViolet + "15", borderWidth: 1, borderColor: Colors.primaryViolet + "40" },
  cancelOptionText: { ...Typography.body, color: Colors.textPrimary, flex: 1 },
  cancelInput: {
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    padding: 14,
    minHeight: 80,
    textAlignVertical: "top",
  },
  cancelModalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  cancelSecondaryBtn: {
    flex: 1,
    backgroundColor: Colors.gray100,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelSecondaryText: { ...Typography.button, color: Colors.textPrimary },
  cancelPrimaryBtn: {
    flex: 1,
    backgroundColor: Colors.romance.primary,
    borderRadius: Layout.radii.control,
    paddingVertical: 14,
    alignItems: "center",
  },
  cancelPrimaryText: { ...Typography.button, color: Colors.white },

  modalOverlayWrapper: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheetDimOverlay: {
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheetPanel: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: Colors.gray300,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
    overflow: "visible",
  },
  modalContent: {
    backgroundColor: Colors.white,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  modalTitle: {
    ...Typography.h2,
    color: Colors.textPrimary,
    fontFamily: FontFamily.heading,
  },
  filterSection: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "600",
    marginBottom: 12,
  },
  overviewRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  overviewChip: {
    minHeight: 44,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    justifyContent: "center",
    alignItems: "center",
  },
  filterRow: { marginBottom: 4, minHeight: 52 },
  filterRowContent: { paddingVertical: 4, alignItems: "center" },
  dateDisplayBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Colors.gray100,
    borderRadius: Layout.radii.control,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  dateDisplayText: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: "500",
  },
  pickerSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.gray200,
  },
  pickerLabel: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "600",
    marginBottom: 8,
  },
  yearRow: { marginBottom: 4 },
  yearChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
    marginRight: 8,
  },
  dropdownList: { maxHeight: 180 },
  dropdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  filterChip: {
    minHeight: 44,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    marginRight: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  filterChipActive: { backgroundColor: Colors.primaryViolet },
  filterChipText: { ...Typography.caption, fontSize: 14, lineHeight: 20, color: Colors.textPrimary },
  filterChipTextActive: { color: Colors.white },
  topicList: { maxHeight: 200 },
  topicRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  topicRowActive: { backgroundColor: Colors.backgroundMuted },
  topicText: { ...Typography.body, color: Colors.textPrimary },
  applyBtn: {
    marginTop: 24,
    backgroundColor: Colors.primaryViolet,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#5A189A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  applyBtnText: { ...Typography.button, color: Colors.white, fontFamily: FontFamily.heading },
  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray200 },
  weekNavBtn: { padding: 4 },
  weekNavTitle: { ...Typography.caption, fontWeight: "600", color: Colors.textPrimary },
  weekStrip: { flexDirection: "row", paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: Colors.gray200 },
  weekDayCell: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 12, marginHorizontal: 2 },
  weekDayToday: { backgroundColor: Colors.primaryViolet },
  weekDayName: { ...Typography.caption, color: Colors.gray600, marginBottom: 4 },
  weekDayNum: { ...Typography.body, fontWeight: "700", color: Colors.textPrimary },
  weekDayTodayText: { color: Colors.white },
  weekDayBlock: { marginTop: 4, paddingTop: 3, borderTopWidth: 1, borderTopColor: Colors.gray200 },
  weekDayBlockTitle: { ...Typography.caption, fontWeight: "600", color: Colors.gray600, marginBottom: 12 },
  weekDayEmpty: { ...Typography.caption, color: Colors.gray500, fontStyle: "italic", marginBottom: 8 },
  monthNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.gray200 },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 4, paddingTop: 12, paddingBottom: 4 },
  monthWeekdayHeader: { width: "14.28%", textAlign: "center", ...Typography.caption, color: Colors.gray600, fontWeight: "600", marginBottom: 8 },
  monthCell: { width: "14.28%", aspectRatio: 1, maxWidth: 48, maxHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 24, margin: 2 },
  monthCellToday: { backgroundColor: Colors.primaryViolet },
  monthCellSelected: { backgroundColor: Colors.primaryViolet + "20", borderWidth: 2, borderColor: Colors.primaryViolet },
  monthCellDay: { ...Typography.caption, fontWeight: "400", color: Colors.textPrimary, marginBottom: 10 },
  monthCellTodayText: { color: Colors.white },
  monthCellSelectedText: { color: Colors.primaryViolet, fontWeight: "600" },
  monthCellIndicator: { position: "absolute", bottom: 3, left: 0, right: 0, alignItems: "center", justifyContent: "center" },
  monthCellDotsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
  monthCellModeDot: { width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5, borderColor: "rgba(0,0,0,0.15)" },
  monthEvents: { marginTop: 0 },
  monthEventsDivider: { height: 1, backgroundColor: Colors.gray200, marginBottom: 4 },
});

export default PlannerIndex;
