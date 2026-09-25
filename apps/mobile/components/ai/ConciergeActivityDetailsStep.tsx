/**
 * Step 2 — Activity Details: location (device default), weather, date, time, budget.
 * Weather auto-refreshes when location, date, or time of day changes.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTranslation } from "react-i18next";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { PrimaryButton } from "@/components/ds";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import {
  getWeatherForCityAndDate,
  getWeatherForCityAndDateRange,
  buildWeatherTimeOptions,
  formatWeatherDisplayText,
  type WeatherSnapshot,
} from "@/lib/weatherClient";
import { getDeviceLocationDisplay } from "@/lib/location/deviceLocation";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { PlanningLocationFields } from "@/components/ai/PlanningLocationFields";
import {
  type ActivityDetails,
  type ActivityCategory,
  type CategoryDetailsVariant,
  type CategoryExtras,
  type DatePreset,
  type TimeOfDay,
  type WhoJoining,
  BUDGET_QUICK_AMOUNTS,
} from "@/lib/ai/conciergePlanningFlow";
import { translateCatalogText } from "@/lib/ai/conciergeCatalogI18n";
import { useAppLocaleTag } from "@/lib/i18n/appLocale";
import { defaultCurrency, currencyForPlace, formatMoney } from "@/lib/i18n/format";
import type { Mode } from "@/types";
import { supabase } from "@/lib/supabase";
import {
  buildProfileAwareSuggestionChips,
  loadProfileAwareSuggestionChips,
} from "@/lib/ai/customPlanPresets";
import { clampTimeOfDayToFutureIfToday, getMinimumPlanDateTime, isSameCalendarDay } from "@/lib/ai/planTimeValidation";
import type { AssumptionDetailsSection } from "@/lib/ai/planAssumptions";

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Split normalized "City, Country" so ISO codes become full names (e.g. DE → Germany) for geocoding + stored details. */
function parseLocation(loc: string, language: string): { city: string; country: string | undefined } {
  const norm = normalizeLocationDisplayString(loc.trim(), language);
  if (!norm) return { city: "", country: undefined };
  const lastComma = norm.lastIndexOf(",");
  if (lastComma < 0) return { city: norm, country: undefined };
  const city = norm.slice(0, lastComma).trim();
  const country = norm.slice(lastComma + 1).trim();
  return { city, country: country || undefined };
}

function getNextSaturday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  if (day === 6) return x;
  const daysUntilSat = day === 0 ? 6 : 6 - day;
  x.setDate(x.getDate() + daysUntilSat);
  return x;
}

// Labels: concierge.datePreset.<key>, concierge.timeOfDay.<key>.
const DATE_PRESETS: DatePreset[] = ["today", "tomorrow", "weekend", "custom"];
const TIME_OPTIONS: TimeOfDay[] = ["any", "morning", "lunch", "afternoon", "evening"];

/** Values stay English (they're sent to the AI); labels are translated for display. */
const VIBE_OPTIONS = [
  { id: "cozy", label: "Cozy" },
  { id: "romantic", label: "Romantic" },
  { id: "lively", label: "Lively" },
  { id: "chic", label: "Chic" },
  { id: "casual", label: "Casual" },
] as const;
const GOAL_OPTIONS = [
  { id: "intro", label: "Quick intro" },
  { id: "catchup", label: "Catch up" },
  { id: "work", label: "Work chat" },
  { id: "pitch", label: "Pitch / deal" },
  { id: "network", label: "Network" },
] as const;
const CUISINE_OTHER = "Other…";
const CUISINE_KEYS: Record<string, string> = {
  Italian: "concierge.cuisine.italian",
  Japanese: "concierge.cuisine.japanese",
  Mexican: "concierge.cuisine.mexican",
  Thai: "concierge.cuisine.thai",
  Indian: "concierge.cuisine.indian",
  French: "concierge.cuisine.french",
  Greek: "concierge.cuisine.greek",
  Korean: "concierge.cuisine.korean",
  Spanish: "concierge.cuisine.spanish",
  [CUISINE_OTHER]: "concierge.cuisine.other",
};

const COMMON_CURRENCIES = ["EUR", "GBP", "USD", "CHF", "PLN"];

export type ConciergeActivityDetailsStepProps = {
  /** Pre-filled from Step 1 (e.g. "Dinner / Brunch"). */
  activityLabel: string | null;
  /** Initial details (e.g. from profile default city). */
  initialDetails: Partial<ActivityDetails>;
  /** Optional notes captured on Step 1 cards (shown at top as editable field). */
  intentNotes?: string;
  onNext: (details: Partial<ActivityDetails>) => void;
  onBack: () => void;
  /** When false, parent shows the back control (e.g. flow header). */
  showInlineBack?: boolean;
  /** Custom plan: optional text + five profile-based chips above location/date/time/budget. */
  profilePromptVariant?: "custom";
  mode?: Mode;
  /** When `trip`, show a 1–7 day length picker (sets `singleDay` / `dateEnd`). */
  activityKey?: string | null;
  /** Category metadata from intent step (sub-activity chips, food flags). */
  activityCategory?: ActivityCategory | null;
  /** Which details extras to show (category-driven). */
  detailsVariant?: CategoryDetailsVariant;
  /** Selected sub-activity key (from sub_activity step). */
  subActivityKey?: string | null;
  /** Selected sub-activity label (used for on-screen context + AI prompt via intentNotes). */
  subActivityLabel?: string | null;
  /** Highlighted topic context from the chosen intent card. */
  topicLabel?: string | null;
  /** Highlighted sub-topic (the chosen intent card label). */
  subTopicLabel?: string | null;
  /** Inline social context (moved into Step 2 to remove a full step). */
  whoJoining?: WhoJoining;
  onWhoJoiningChange?: (who: WhoJoining) => void;
  /**
   * Plan-it assumption sheet: render only this one section (plus its pickers) and the submit
   * button — same inputs as the full step, nothing else.
   */
  onlyField?: AssumptionDetailsSection;
  /** Submit button label (default "Continue"). */
  submitLabel?: string;
  /** Extra style for the outer scroll view (e.g. `flexGrow: 0` inside a bottom sheet). */
  scrollStyle?: StyleProp<ViewStyle>;
};

export function ConciergeActivityDetailsStep({
  activityLabel,
  initialDetails,
  intentNotes,
  onNext,
  onBack,
  showInlineBack = true,
  profilePromptVariant,
  mode = "romance",
  activityKey = null,
  activityCategory = null,
  detailsVariant = "standard",
  subActivityKey = null,
  subActivityLabel = null,
  topicLabel = null,
  subTopicLabel = null,
  whoJoining = "decide_later",
  onWhoJoiningChange,
  onlyField,
  submitLabel,
  scrollStyle,
}: ConciergeActivityDetailsStepProps) {
  /** Full step vs. a single-section sheet (Plan-it assumption chip). */
  const full = !onlyField;
  const show = (section: AssumptionDetailsSection) => full || onlyField === section;
  /** Only the full step and the location sheet can change the city, so only they require it. */
  const requireCity = show("location");
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { t, i18n } = useTranslation();
  const appLanguage = i18n?.language ?? "en";
  const appLocale = useAppLocaleTag();
  const [location, setLocation] = useState(() =>
    normalizeLocationDisplayString(initialDetails.location ?? "", appLanguage)
  );
  /** True after user taps the locate button; cleared when they edit the field or pick from list. */
  const [locationFromGps, setLocationFromGps] = useState(false);
  const [searchRadiusKm, setSearchRadiusKm] = useState<number | null>(
    typeof initialDetails.searchRadiusKm === "number" ? initialDetails.searchRadiusKm : null
  );
  const [pinLatitude, setPinLatitude] = useState<number | null>(
    typeof initialDetails.latitude === "number" ? initialDetails.latitude : null
  );
  const [pinLongitude, setPinLongitude] = useState<number | null>(
    typeof initialDetails.longitude === "number" ? initialDetails.longitude : null
  );
  const [pinLabel, setPinLabel] = useState<string | null>(initialDetails.pinLabel ?? null);
  const [, setDeviceLocationLoading] = useState(false);
  const [datePreset, setDatePreset] = useState<DatePreset>(initialDetails.datePreset ?? "today");
  const [date, setDate] = useState<Date>(initialDetails.date ?? new Date());
  const [dateEnd, setDateEnd] = useState<Date>(() => {
    const d = initialDetails.date ?? new Date();
    const end = initialDetails.dateEnd ?? new Date(d);
    end.setDate(end.getDate() + 1);
    return end;
  });
  const [singleDay, setSingleDay] = useState(initialDetails.singleDay ?? true);
  const computeTripLenFromInitial = () => {
    if (initialDetails.singleDay !== false) return 1;
    const start = initialDetails.date ?? new Date();
    const end = initialDetails.dateEnd ?? start;
    const ms = end.getTime() - start.getTime();
    const days = Math.round(ms / 86400000) + 1;
    return Math.min(7, Math.max(1, days));
  };
  const [tripLengthDays, setTripLengthDays] = useState(
    activityKey === "trip" ? computeTripLenFromInitial() : 1
  );
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(initialDetails.timeOfDay ?? "any");
  const [budgetAmount, setBudgetAmount] = useState(initialDetails.budgetAmount ?? "");
  const [budgetCurrency, setBudgetCurrency] = useState(
    () => initialDetails.budgetCurrency || defaultCurrency(initialDetails.location)
  );
  /** The planned place decides the currency until the user picks one. */
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDateEndPicker, setShowDateEndPicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [weatherSnapshot, setWeatherSnapshot] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [cuisine, setCuisine] = useState(initialDetails.cuisine ?? "");
  const [atmosphere, setAtmosphere] = useState(initialDetails.atmosphere ?? "");
  const [indoorOutdoor, setIndoorOutdoor] = useState<"indoor" | "outdoor" | "any">(
    initialDetails.indoorOutdoor ?? "any"
  );
  const [customPromptExtra, setCustomPromptExtra] = useState(initialDetails.customPromptExtra ?? "");
  const [intentNotesText, setIntentNotesText] = useState(
    intentNotes ?? initialDetails.intentNotes ?? ""
  );
  const [additionalInfo, setAdditionalInfo] = useState(initialDetails.additionalInfo ?? "");
  const [mustHaves, setMustHaves] = useState(initialDetails.mustHaves ?? "");
  const [customChips, setCustomChips] = useState<string[]>([]);
  const [customChipsLoading, setCustomChipsLoading] = useState(false);
  const deviceLocationRequested = useRef(false);
  /** First GPS "where I am" line; kept when user edits destination. */
  const [originLocationLabel, setOriginLocationLabel] = useState(initialDetails.originLocationLabel ?? "");
  const [exactTimeEnabled, setExactTimeEnabled] = useState(!!initialDetails.exactTimeHm);
  const [exactTime, setExactTime] = useState<Date>(() => {
    const d = new Date();
    d.setHours(18, 0, 0, 0);
    const hm = initialDetails.exactTimeHm;
    if (typeof hm === "string" && /^\d{2}:\d{2}$/.test(hm)) {
      d.setHours(parseInt(hm.slice(0, 2), 10), parseInt(hm.slice(3, 5), 10), 0, 0);
    }
    // Never default/restore a time that's already passed today — a user can't select the past.
    return clampTimeOfDayToFutureIfToday(initialDetails.date ?? new Date(), d);
  });
  const [showExactTimePicker, setShowExactTimePicker] = useState(false);

  const [customCuisineOpen, setCustomCuisineOpen] = useState(false);

  const [categoryExtras, setCategoryExtras] = useState<CategoryExtras | null>(() => {
    const fromInitial = initialDetails.categoryExtras as CategoryExtras | undefined;
    if (fromInitial && typeof fromInitial === "object") return fromInitial;
    return null;
  });

  const showProfilePrompt = profilePromptVariant === "custom";

  useEffect(() => {
    if (!showProfilePrompt) {
      setCustomChips([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setCustomChipsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id || cancelled) {
        setCustomChips(
          buildProfileAwareSuggestionChips({
            mode,
            city: null,
            ageYears: null,
            interests: [],
            lifestyleTags: [],
            hobbies: [],
            recentPlanTitles: [],
          })
        );
        setCustomChipsLoading(false);
        return;
      }
      const { chips } = await loadProfileAwareSuggestionChips(user.id, mode);
      if (cancelled) return;
      setCustomChips(chips);
      setCustomChipsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [showProfilePrompt, mode]);

  const appendCustomChip = useCallback((line: string) => {
    Haptics.selectionAsync();
    setCustomPromptExtra((prev) => {
      const t = line.trim();
      if (!t) return prev;
      const low = prev.toLowerCase();
      if (low.includes(t.toLowerCase())) return prev;
      return prev.trim() ? `${prev.trim()}, ${t}` : t;
    });
  }, []);

  const dateStr = dayKey(date);
  const dateEndStr = dayKey(dateEnd);
  const { city: cityPart, country: countryPart } = parseLocation(location, appLanguage);
  const exactTimeHm = useMemo(() => {
    if (!exactTimeEnabled) return undefined;
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(exactTime.getHours())}:${pad(exactTime.getMinutes())}`;
  }, [exactTimeEnabled, exactTime]);
  const weatherTimeOptions = useMemo(
    () =>
      buildWeatherTimeOptions({
        timeOfDay: exactTimeHm ? undefined : timeOfDay,
        exactTimeHm,
      }),
    [timeOfDay, exactTimeHm]
  );

  // If the chosen day is (or becomes) today, keep the exact-time selection from silently
  // sitting in the past — e.g. switching the date preset back to "today" after time has passed.
  useEffect(() => {
    setExactTime((prev) => clampTimeOfDayToFutureIfToday(date, prev));
  }, [date]);

  // Sync location when parent passes pre-set location (e.g. profile city loaded after mount)
  useEffect(() => {
    const next = (initialDetails.location ?? "").trim();
    if (!next) return;
    const normalized = normalizeLocationDisplayString(next, appLanguage);
    setLocation((prev) => (prev.trim() ? prev : normalized));
  }, [initialDetails.location, appLanguage]);

  // Pre-fill location from device once when no initialDetails.location
  useEffect(() => {
    if (deviceLocationRequested.current) return;
    if (initialDetails.location?.trim()) {
      deviceLocationRequested.current = true;
      return;
    }
    deviceLocationRequested.current = true;
    setDeviceLocationLoading(true);
    getDeviceLocationDisplay(appLanguage)
      .then((res) => {
        if (res.ok && res.display) {
          const norm = normalizeLocationDisplayString(res.display, appLanguage);
          setLocation(norm);
          setOriginLocationLabel(norm);
          setLocationFromGps(true);
        }
      })
      .finally(() => setDeviceLocationLoading(false));
  }, [initialDetails.location, appLanguage]);

  useEffect(() => {
    if (currencyTouched) return;
    const fromPlace = currencyForPlace(location);
    if (fromPlace) setBudgetCurrency(fromPlace);
  }, [location, currencyTouched]);

  // Weather: refresh when location, date, or time change
  useEffect(() => {
    if (!cityPart) {
      setWeatherSnapshot(null);
      return;
    }
    let cancelled = false;
    setWeatherLoading(true);
    if (singleDay) {
      getWeatherForCityAndDate(cityPart, dateStr, countryPart, weatherTimeOptions)
        .then((w) => {
          if (!cancelled) setWeatherSnapshot(w ?? null);
        })
        .finally(() => {
          if (!cancelled) setWeatherLoading(false);
        });
    } else {
      getWeatherForCityAndDateRange(cityPart, dateStr, dateEndStr, countryPart)
        .then((w) => {
          if (!cancelled) setWeatherSnapshot(w ?? null);
        })
        .finally(() => {
          if (!cancelled) setWeatherLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [cityPart, countryPart, dateStr, dateEndStr, singleDay, weatherTimeOptions]);

  // Trip: day-count picker keeps `dateEnd` and `singleDay` aligned.
  useEffect(() => {
    if (activityKey !== "trip") return;
    if (tripLengthDays <= 1) {
      setSingleDay(true);
      setDateEnd((prev) => {
        const next = new Date(date);
        next.setHours(0, 0, 0, 0);
        return next;
      });
      return;
    }
    setSingleDay(false);
    const end = new Date(date);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + tripLengthDays - 1);
    setDateEnd(end);
  }, [activityKey, tripLengthDays, date]);

  const applyDatePreset = useCallback((preset: DatePreset) => {
    Haptics.selectionAsync();
    setDatePreset(preset);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (preset === "today") {
      setDate(today);
      setDateEnd(today);
      setSingleDay(true);
    } else if (preset === "tomorrow") {
      const t = new Date(today);
      t.setDate(t.getDate() + 1);
      setDate(t);
      setDateEnd(t);
      setSingleDay(true);
    } else if (preset === "weekend") {
      const sat = getNextSaturday(today);
      const sun = new Date(sat);
      sun.setDate(sun.getDate() + 1);
      setDate(sat);
      setDateEnd(sun);
      setSingleDay(false);
    } else {
      setSingleDay(true);
    }
  }, []);

  /**
   * Proactive rain pivot: when the fetched weather for the chosen date/location looks rainy,
   * offer "Postpone a day" / "Prefer indoor" so outdoor plans aren't dead on arrival.
   * (Ported from the legacy ConciergeRequestForm advisory, which was unreachable for Planner.)
   */
  const rainAdvisory = useMemo(() => {
    if (!weatherSnapshot || !cityPart) return false;
    if (singleDay) {
      return (
        !!weatherSnapshot.date &&
        ((weatherSnapshot.precipitation ?? 0) > (weatherSnapshot.forecast_hour ? 0.5 : 2) ||
          (weatherSnapshot.precipitation_day ?? 0) > 2)
      );
    }
    return (weatherSnapshot.rainy_days ?? 0) > 0;
  }, [weatherSnapshot, cityPart, singleDay]);

  const handlePostponeDay = useCallback(() => {
    Haptics.selectionAsync();
    setDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      return next;
    });
    setDateEnd((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 1);
      return next;
    });
    setDatePreset("custom");
  }, []);

  const handlePreferIndoor = useCallback(() => {
    Haptics.selectionAsync();
    setIndoorOutdoor((prev) => (prev === "indoor" ? "any" : "indoor"));
  }, []);

  const handleNext = () => {
    if (requireCity && !cityPart.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const locLine = normalizeLocationDisplayString(location, appLanguage);
    const parsed = parseLocation(locLine, appLanguage);
    const pad = (n: number) => String(n).padStart(2, "0");
    // Final guard: never hand a past time to the AI request even if state somehow drifted stale.
    const safeExactTime = clampTimeOfDayToFutureIfToday(date, exactTime);
    const exactTimeHm =
      singleDay && exactTimeEnabled ? `${pad(safeExactTime.getHours())}:${pad(safeExactTime.getMinutes())}` : undefined;
    onNext({
      location: locLine,
      city: parsed.city || undefined,
      country: parsed.country,
      intentNotes: intentNotesText.trim() || undefined,
      additionalInfo: additionalInfo.trim() || undefined,
      datePreset,
      date,
      dateEnd: singleDay ? undefined : dateEnd,
      singleDay,
      timeOfDay,
      budgetAmount,
      budgetCurrency,
      cuisine: cuisine.trim() || undefined,
      atmosphere: atmosphere.trim() || undefined,
      indoorOutdoor: indoorOutdoor !== "any" ? indoorOutdoor : undefined,
      categoryExtras: categoryExtras || undefined,
      customPromptExtra: showProfilePrompt ? customPromptExtra.trim() || undefined : undefined,
      originLocationLabel: originLocationLabel.trim() || undefined,
      exactTimeHm,
      searchRadiusKm: searchRadiusKm ?? undefined,
      latitude: pinLatitude ?? undefined,
      longitude: pinLongitude ?? undefined,
      pinLabel: pinLabel ?? undefined,
    });
  };

  const showFoodFields = detailsVariant === "food_drink" || !!activityCategory?.foodRelated;

  const setExtra = useCallback(
    <K extends keyof CategoryExtras>(key: K, value: CategoryExtras[K]) => {
      setCategoryExtras((prev) => ({ ...(prev ?? {}), [key]: value }));
    },
    []
  );

  const keyQuestion = useMemo(() => {
    // Minimal but high-impact coverage: Dinner & drinks, Coffee meeting, Sport & activity, plus food-led categories.
    if (showFoodFields) {
      return {
        title: t("concierge.details.vibe"),
        subtitle: "",
        options: VIBE_OPTIONS.map((o) => ({ ...o, display: t(`concierge.details.vibeOption.${o.id}`) })),
        selected: (categoryExtras?.atmosphere || "").trim(),
        onSelect: (label: string) => {
          Haptics.selectionAsync();
          setAtmosphere(label);
          setExtra("atmosphere", label);
        },
      };
    }
    if (activityKey === "coffee_meeting" || activityKey === "lunch_meeting") {
      return {
        title: t("concierge.details.goal"),
        subtitle: t("concierge.details.goalQuestion"),
        options: GOAL_OPTIONS.map((o) => ({ ...o, display: t(`concierge.details.goalOption.${o.id}`) })),
        selected: (categoryExtras?.meetingGoal || "").trim(),
        onSelect: (label: string) => {
          Haptics.selectionAsync();
          setExtra("meetingGoal", label);
        },
      };
    }
    if (activityKey === "sport_activity" || activityKey === "sport") {
      const opts = (activityCategory?.subActivities ?? []);
      const fallback = ["Tennis / padel", "Bowling", "Cycling route", "Evening stroll", "Indoor climbing"];
      const list = (opts.length ? opts : fallback).slice(0, 6);
      return {
        title: t("concierge.details.type"),
        subtitle: t("concierge.details.typeActivity"),
        options: list.map((label, idx) => ({ id: String(idx), label, display: translateCatalogText(t, label) })),
        selected: (categoryExtras?.sportSubType || "").trim(),
        onSelect: (label: string) => {
          Haptics.selectionAsync();
          setExtra("sportSubType", label);
        },
      };
    }
    if (activityKey === "art_culture") {
      const opts = (activityCategory?.subActivities ?? []);
      const list = (opts.length ? opts : ["Museum / gallery", "Theatre / show", "Cinema", "Exhibition"]).slice(0, 6);
      return {
        title: t("concierge.details.type"),
        subtitle: t("concierge.details.typeCulture"),
        options: list.map((label, idx) => ({ id: String(idx), label, display: translateCatalogText(t, label) })),
        selected: (categoryExtras?.artSubType || "").trim(),
        onSelect: (label: string) => {
          Haptics.selectionAsync();
          setExtra("artSubType", label);
        },
      };
    }
    return null;
  }, [activityKey, activityCategory?.subActivities, categoryExtras?.artSubType, categoryExtras?.atmosphere, categoryExtras?.meetingGoal, categoryExtras?.sportSubType, setExtra, showFoodFields, t]);

  const cuisineChips = useMemo(() => Object.keys(CUISINE_KEYS), []);

  return (
    <GestureScrollView style={[styles.scroll, scrollStyle]} contentContainerStyle={styles.content}>
      {full && showInlineBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.primary} />
          <Text style={styles.backText}>{t("common.back")}</Text>
        </TouchableOpacity>
      ) : null}

      {!full ? null : showProfilePrompt ? (
        <View style={styles.customPromptBlock}>
          <Text style={styles.customPromptLabel}>{t("concierge.details.customPromptLabel")}</Text>
          <TextInput
            style={styles.customPromptInput}
            value={customPromptExtra}
            onChangeText={setCustomPromptExtra}
            placeholder={t("concierge.details.customPromptPlaceholder")}
            placeholderTextColor={theme.colors.textMuted}
            multiline
            textAlignVertical="top"
            maxLength={600}
          />
          <Text style={styles.customChipsLabel}>
            {customChipsLoading ? t("concierge.details.buildingSuggestions") : t("concierge.details.suggestionsForYou")}
          </Text>
          {customChipsLoading ? (
            <ActivityIndicator color={theme.colors.primary} style={{ marginVertical: 12 }} />
          ) : (
            <View style={styles.customChipWrap}>
              {customChips.map((line, i) => (
                <TouchableOpacity
                  key={`c-${i}-${line.slice(0, 20)}`}
                  style={styles.customChipRow}
                  onPress={() => appendCustomChip(line)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.customChipText} numberOfLines={2}>
                    {line}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={styles.customDivider} />
        </View>
      ) : (
        <View style={{ marginBottom: 8 }}>
          {/* Removed helper copy; optional fields live in "More details". */}
        </View>
      )}

      {full && subTopicLabel?.trim() ? (
        <View style={styles.topicHero}>
          <Text style={styles.topicHeroLabel}>{t("concierge.details.topic")}</Text>
          <Text style={styles.topicHeroTitle} numberOfLines={2}>
            {subActivityLabel?.trim()
              ? t("concierge.details.topicWithSub", {
                  topic: translateCatalogText(t, subTopicLabel.trim()),
                  sub: translateCatalogText(t, subActivityLabel.trim()),
                })
              : translateCatalogText(t, subTopicLabel.trim())}
          </Text>
        </View>
      ) : null}

      {full ? (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{t("concierge.details.whoJoining")}</Text>
        </View>
        <View style={styles.surfaceCard}>
          <View style={styles.whoGrid}>
            {([
              { key: "just_me" as const, title: t("concierge.who.just_me"), sub: t("concierge.who.just_me.sub"), icon: "person-outline" as const },
              { key: "share" as const, title: t("concierge.who.share"), sub: t("concierge.who.share.sub"), icon: "people-outline" as const },
              { key: "decide_later" as const, title: t("concierge.who.decide_later"), sub: t("concierge.who.decide_later.sub"), icon: "time-outline" as const },
            ] as const).map((opt) => {
              const active = whoJoining === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.whoCard, active && styles.whoCardActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onWhoJoiningChange?.(opt.key);
                  }}
                  activeOpacity={0.9}
                >
                  <View style={styles.whoCardTop}>
                    <View style={[styles.whoIconWrap, active && styles.whoIconWrapActive]}>
                      <Ionicons name={opt.icon} size={18} color={active ? theme.colors.onPrimary : theme.colors.primary} />
                    </View>
                    <Text style={[styles.whoTitle, active && styles.whoTitleActive]}>{opt.title}</Text>
                  </View>
                  <Text style={[styles.whoSub, active && styles.whoSubActive]}>{opt.sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
      ) : null}

      {/* Key question (dominant choice) */}
      {full && keyQuestion ? (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{keyQuestion.title}</Text>
          </View>
          {keyQuestion.subtitle ? (
            <Text style={styles.sectionSubTitle}>{keyQuestion.subtitle}</Text>
          ) : null}
          <View style={styles.surfaceCard}>
            <View style={styles.keyQuestionGrid}>
              {keyQuestion.options.map((opt) => {
                const active = keyQuestion.selected === opt.label;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.keyChip, active && styles.keyChipActive]}
                    onPress={() => keyQuestion.onSelect(opt.label)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.keyChipText, active && styles.keyChipTextActive]}>{opt.display}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}

      {show("location") ? (
      <View style={styles.sectionCard}>
        <PlanningLocationFields
          value={{
            location,
            city: cityPart || undefined,
            country: countryPart,
            searchRadiusKm,
            latitude: pinLatitude,
            longitude: pinLongitude,
            pinLabel,
            locationFromGps,
          }}
          onChange={(next) => {
            setLocation(next.location);
            setLocationFromGps(!!next.locationFromGps);
            setSearchRadiusKm(next.searchRadiusKm ?? null);
            setPinLatitude(next.latitude ?? null);
            setPinLongitude(next.longitude ?? null);
            setPinLabel(next.pinLabel ?? null);
            if (next.locationFromGps && next.location) {
              setOriginLocationLabel(next.location);
            }
          }}
          language={appLanguage}
        />
      </View>
      ) : null}

      {full && cityPart ? (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t("concierge.details.weather")}</Text>
          </View>
          <View style={styles.surfaceCard}>
            <View style={styles.weatherRow}>
              {weatherLoading ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : weatherSnapshot ? (
                <>
                  <Ionicons name="partly-sunny-outline" size={18} color={theme.colors.textSecondary} />
                  <Text style={styles.weatherText}>
                    {formatWeatherDisplayText(weatherSnapshot, { singleDay, dateLabel: dateStr })}
                  </Text>
                </>
              ) : (
                <Text style={styles.weatherText}>{t("concierge.details.weatherUnavailable")}</Text>
              )}
            </View>
          </View>
          {rainAdvisory ? (
            <View style={styles.advisoryBox}>
              <View style={styles.advisoryHeaderRow}>
                <Ionicons name="rainy-outline" size={20} color={theme.colors.primary} />
                <Text style={styles.advisoryText}>
                  {singleDay
                    ? t("concierge.details.rainSingle", { city: cityPart })
                    : t("concierge.details.rainRange", {
                        count: weatherSnapshot?.total_days ?? 0,
                        rainy: weatherSnapshot?.rainy_days ?? 0,
                        city: cityPart,
                      })}
                </Text>
              </View>
              <View style={styles.advisoryActions}>
                {singleDay ? (
                  <TouchableOpacity onPress={handlePostponeDay} style={styles.advisoryBtn} activeOpacity={0.8}>
                    <Text style={styles.advisoryBtnText}>{t("concierge.details.postponeDay")}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={handlePreferIndoor}
                  style={[styles.advisoryBtn, indoorOutdoor === "indoor" && styles.advisoryBtnActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.advisoryBtnText, indoorOutdoor === "indoor" && styles.advisoryBtnTextActive]}>
                    {indoorOutdoor === "indoor" ? t("concierge.details.indoorPreferred") : t("concierge.details.preferIndoor")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {show("dateTime") ? (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{t("concierge.confirm.field.date")}</Text>
        </View>
        <View style={styles.surfaceCard}>
          <View style={[styles.chipsRow, { marginBottom: 0 }]}>
            {DATE_PRESETS.map((key) => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, datePreset === key && styles.chipActive]}
                onPress={() => applyDatePreset(key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, datePreset === key && styles.chipTextActive]}>{t(`concierge.datePreset.${key}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {(datePreset === "custom" || datePreset === "weekend") ? (
            <View style={[styles.dateRow, { marginTop: 12, marginBottom: 0 }]}>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.85}>
                <Ionicons name="calendar-outline" size={18} color={theme.colors.textSecondary} />
                <Text style={styles.dateBtnText}>
                  {date.toLocaleDateString(appLocale, { weekday: "short", month: "short", day: "numeric" })}
                </Text>
              </TouchableOpacity>
              {!singleDay && activityKey !== "trip" ? (
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDateEndPicker(true)} activeOpacity={0.85}>
                  <Ionicons name="calendar-outline" size={18} color={theme.colors.textSecondary} />
                  <Text style={styles.dateBtnText}>
                    {t("concierge.details.dateTo", { date: dateEnd.toLocaleDateString(appLocale, { weekday: "short", month: "short", day: "numeric" }) })}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      ) : null}

      {full && activityKey === "trip" && (
        <>
          <Text style={styles.label}>{t("concierge.details.tripLength")}</Text>
          <Text style={styles.inlineHint}>{t("concierge.details.tripLengthHint")}</Text>
          <View style={styles.chipsRow}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.chip, tripLengthDays === n && styles.chipActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setTripLengthDays(n);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, tripLengthDays === n && styles.chipTextActive]}>
                  {t("concierge.details.days", { count: n })}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {tripLengthDays > 1 ? (
            <Text style={styles.changeHint}>
              {t("concierge.details.ends", { date: dateEnd.toLocaleDateString(appLocale, { weekday: "short", month: "short", day: "numeric" }) })}
            </Text>
          ) : null}
        </>
      )}
      {showDatePicker &&
        (Platform.OS === "ios" ? (
          <Modal visible transparent animationType="fade">
            <Pressable style={styles.pickerOverlay} onPress={() => setShowDatePicker(false)}>
              <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="spinner"
                  onChange={(_, d) => d && setDate(d)}
                  minimumDate={new Date()}
                />
                <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.pickerDone}>
                  <Text style={styles.pickerDoneText}>{t("common.done")}</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        ) : (
          <DateTimePicker
            value={date}
            mode="date"
            display="default"
            minimumDate={new Date()}
            onChange={(event, d) => {
              setShowDatePicker(false);
              if (event.type === "set" && d) setDate(d);
            }}
          />
        ))}
      {showDateEndPicker &&
        (Platform.OS === "ios" ? (
          <Modal visible transparent animationType="fade">
            <Pressable style={styles.pickerOverlay} onPress={() => setShowDateEndPicker(false)}>
              <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
                <DateTimePicker
                  value={dateEnd}
                  mode="date"
                  display="spinner"
                  onChange={(_, d) => d && setDateEnd(d)}
                  minimumDate={date}
                />
                <TouchableOpacity onPress={() => setShowDateEndPicker(false)} style={styles.pickerDone}>
                  <Text style={styles.pickerDoneText}>{t("common.done")}</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        ) : (
          <DateTimePicker
            value={dateEnd}
            mode="date"
            display="default"
            minimumDate={date}
            onChange={(event, d) => {
              setShowDateEndPicker(false);
              if (event.type === "set" && d) setDateEnd(d);
            }}
          />
        ))}
      {showExactTimePicker &&
        (Platform.OS === "ios" ? (
          <Modal visible transparent animationType="fade">
            <Pressable style={styles.pickerOverlay} onPress={() => setShowExactTimePicker(false)}>
              <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
                <DateTimePicker
                  value={exactTime}
                  mode="time"
                  display="spinner"
                  onChange={(_, d) => d && setExactTime(clampTimeOfDayToFutureIfToday(date, d))}
                  minimumDate={isSameCalendarDay(date, new Date()) ? getMinimumPlanDateTime() : undefined}
                />
                <TouchableOpacity onPress={() => setShowExactTimePicker(false)} style={styles.pickerDone}>
                  <Text style={styles.pickerDoneText}>{t("common.done")}</Text>
                </TouchableOpacity>
              </Pressable>
            </Pressable>
          </Modal>
        ) : (
          <DateTimePicker
            value={exactTime}
            mode="time"
            display="default"
            minimumDate={isSameCalendarDay(date, new Date()) ? getMinimumPlanDateTime() : undefined}
            onChange={(event, d) => {
              setShowExactTimePicker(false);
              if (event.type === "set" && d) setExactTime(clampTimeOfDayToFutureIfToday(date, d));
            }}
          />
        ))}

      {show("dateTime") && singleDay ? (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t("concierge.confirm.field.time")}</Text>
          </View>
          <View style={styles.surfaceCard}>
          <View style={[styles.chipsRow, { marginBottom: 0 }]}>
            {TIME_OPTIONS.map((key) => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, timeOfDay === key && styles.chipActive]}
                onPress={() => { Haptics.selectionAsync(); setTimeOfDay(key); }}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, timeOfDay === key && styles.chipTextActive]}>{t(`concierge.timeOfDay.${key}`)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              setExactTimeEnabled((v) => !v);
            }}
            style={[styles.locatePillBtn, { marginTop: 12, alignSelf: "flex-start" }]}
            activeOpacity={0.85}
          >
            <Ionicons
              name={exactTimeEnabled ? "checkbox" : "square-outline"}
              size={18}
              color={exactTimeEnabled ? theme.colors.primary : theme.colors.textSecondary}
            />
            <Text style={styles.locatePillBtnText}>{t("concierge.details.exactTime")}</Text>
          </TouchableOpacity>

          {exactTimeEnabled ? (
            <TouchableOpacity
              style={[styles.dateBtn, { marginTop: 10, marginBottom: 0 }]}
              onPress={() => setShowExactTimePicker(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="time-outline" size={18} color={theme.colors.textSecondary} />
              <Text style={styles.dateBtnText}>
                {`${String(exactTime.getHours()).padStart(2, "0")}:${String(exactTime.getMinutes()).padStart(2, "0")}`}
              </Text>
            </TouchableOpacity>
          ) : null}
          </View>
        </View>
      ) : null}

      {show("budget") ? (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{t("concierge.details.budget")}</Text>
        </View>
        <View style={styles.surfaceCard}>
        <View style={[styles.chipsRow, { marginBottom: 12 }]}>
        {BUDGET_QUICK_AMOUNTS.map((amount) => {
          const isActive = budgetAmount === String(amount);
          return (
            <TouchableOpacity
              key={amount}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => { Haptics.selectionAsync(); setBudgetAmount(String(amount)); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{formatMoney(amount, budgetCurrency, appLocale)}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[
            styles.chip,
            budgetAmount !== "" &&
              !(BUDGET_QUICK_AMOUNTS as readonly number[]).includes(Number(budgetAmount)) &&
              styles.chipActive,
          ]}
          onPress={() => { Haptics.selectionAsync(); setBudgetAmount(""); }}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.chipText,
              budgetAmount !== "" &&
                !(BUDGET_QUICK_AMOUNTS as readonly number[]).includes(Number(budgetAmount)) &&
                styles.chipTextActive,
            ]}
          >
            {t("concierge.datePreset.custom")}
          </Text>
        </TouchableOpacity>
        </View>
        <View style={[styles.budgetRow, { marginBottom: 0 }]}>
        <TextInput
          style={styles.budgetInput}
          placeholder={t("concierge.details.budgetPlaceholder")}
          placeholderTextColor={theme.colors.textMuted}
          value={budgetAmount}
          onChangeText={(t) => setBudgetAmount(t.replace(/[^0-9.,]/g, ""))}
          keyboardType="decimal-pad"
        />
        <TouchableOpacity
          style={styles.currencyBtn}
          onPress={() => { Haptics.selectionAsync(); setShowCurrencyPicker(true); }}
          activeOpacity={0.85}
        >
          <Text style={styles.currencyText}>{budgetCurrency}</Text>
          <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </View>
      </View>
      </View>
      ) : null}
      <Modal visible={showCurrencyPicker} transparent animationType="fade">
        <Pressable style={styles.pickerOverlay} onPress={() => setShowCurrencyPicker(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>{t("concierge.details.currency")}</Text>
            {[...new Set([budgetCurrency, ...COMMON_CURRENCIES])].map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.pickerItem, budgetCurrency === c && styles.pickerItemActive]}
                onPress={() => { Haptics.selectionAsync(); setBudgetCurrency(c); setCurrencyTouched(true); setShowCurrencyPicker(false); }}
              >
                <Text style={[styles.pickerItemText, budgetCurrency === c && styles.pickerItemTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {full && showFoodFields ? (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t("concierge.details.cuisine")}</Text>
          </View>
          <View style={styles.surfaceCard}>
            <View style={[styles.keyQuestionGrid, { marginBottom: 0 }]}>
              {cuisineChips.map((label) => {
                const active = cuisine === label || (label === CUISINE_OTHER && customCuisineOpen);
                return (
                  <TouchableOpacity
                    key={label}
                    style={[styles.keyChip, active && styles.keyChipActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      if (label === CUISINE_OTHER) {
                        setCustomCuisineOpen(true);
                        setCuisine("");
                        return;
                      }
                      setCustomCuisineOpen(false);
                      setCuisine(label);
                      setExtra("cuisine", label);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.keyChipText, active && styles.keyChipTextActive]}>{t(CUISINE_KEYS[label])}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {customCuisineOpen ? (
              <TextInput
                style={[styles.textField, { marginTop: 12, marginBottom: 0 }]}
                placeholder={t("concierge.details.cuisinePlaceholder")}
                placeholderTextColor={theme.colors.textMuted}
                value={cuisine}
                onChangeText={(t) => {
                  setCuisine(t);
                  setExtra("cuisine", t.trim() || undefined);
                }}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {(full && showFoodFields) || onlyField === "indoorOutdoor" ? (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>{t("concierge.details.indoorOutdoor")}</Text>
          </View>
          <View style={styles.surfaceCard}>
            <View style={[styles.chipsRow, { marginBottom: 0 }]}>
              {(["any", "indoor", "outdoor"] as const).map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.chip, indoorOutdoor === key && styles.chipActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setIndoorOutdoor(key);
                    setExtra("indoorOutdoor", key);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, indoorOutdoor === key && styles.chipTextActive]}>
                    {t(`concierge.details.setting.${key}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      {full ? (
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{t("concierge.details.notes")}</Text>
        </View>
        <View style={styles.surfaceCard}>
          <TextInput
            style={[styles.textField, { minHeight: 90, marginBottom: 0, textAlignVertical: "top" }]}
            placeholder={t("concierge.details.notesPlaceholder", { max: 150 })}
            placeholderTextColor={theme.colors.textMuted}
            value={additionalInfo}
            onChangeText={setAdditionalInfo}
            multiline
            maxLength={150}
          />
        </View>
      </View>
      ) : null}

      {/* Category extras — keep minimal for now (food fields already collected above). */}
      {detailsVariant === "food_drink" ? (
        <View style={{ marginTop: 4 }} />
      ) : null}

      {requireCity && !cityPart.trim() ? (
        <Text style={[theme.type.caption, { color: theme.colors.error, marginBottom: theme.spacing.sm, fontWeight: "600" }]}>
          {t("concierge.details.cityRequired")}
        </Text>
      ) : null}
      <PrimaryButton title={submitLabel ?? t("concierge.details.continue")} onPress={handleNext} disabled={requireCity && !cityPart.trim()} />
    </GestureScrollView>
  );
}

function makeStyles(theme: AppTheme) {
  return StyleSheet.create({
  // Match Step 1 (Intent) feel: clean canvas + section blocks.
  scroll: { flex: 1, backgroundColor: theme.colors.surface },
  content: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxl, paddingTop: 6 },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  backText: { ...theme.type.caption, color: theme.colors.primary, fontWeight: "600" },
  // Hero stays as a premium card (topic anchor).
  topicHero: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 18,
    ...theme.elevation(1),
  },
  topicHeroLabel: { ...theme.type.caption, color: theme.colors.textSecondary, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  topicHeroTitle: { ...theme.type.h3, color: theme.colors.textPrimary, marginTop: 4 },

  // Section block styling mirrors Step 1 (left accent border + uppercase label).
  sectionCard: {
    marginBottom: 20,
  },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  sectionTitle: {
    ...theme.type.caption,
    fontWeight: "800",
    color: theme.colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionSubTitle: { ...theme.type.body, color: theme.colors.textPrimary, fontWeight: "700", marginBottom: 10 },

  // Standard surface card inside a section (same as Step 1 cards).
  surfaceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.elevation(1),
  },
  locatePillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: theme.colors.backgroundMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  locatePillBtnText: { ...theme.type.caption, color: theme.colors.primary, fontWeight: "700" },
  textField: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
  },
  subActivityBlock: { marginBottom: 20 },
  subActivityPrompt: {
    ...theme.type.caption,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: 10,
  },
  customPromptBlock: { marginBottom: 20 },
  customPromptLabel: {
    ...theme.type.caption,
    fontSize: 13,
    fontWeight: "400",
    color: theme.colors.textMuted,
    marginBottom: 10,
    lineHeight: 20,
  },
  customPromptInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...theme.type.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.surface,
    marginBottom: 14,
  },
  customChipsLabel: {
    ...theme.type.caption,
    fontWeight: "600",
    color: theme.colors.textSecondary,
    marginBottom: 10,
  },
  customChipWrap: { gap: 10, marginBottom: 8 },
  customChipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  customChipText: {
    ...theme.type.caption,
    flex: 1,
    color: theme.colors.textPrimary,
    lineHeight: 20,
  },
  customDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginBottom: 20,
    marginTop: 8,
  },
  label: { ...theme.type.caption, color: theme.colors.textSecondary, fontWeight: "600", marginBottom: 8 },
  changeHint: { ...theme.type.caption, fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  inlineHint: {
    ...theme.type.caption,
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 4,
    marginBottom: 8,
    fontStyle: "italic",
  },
  // Legacy (kept until all callers removed)
  locationRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  locationInput: {
    flex: 1,
    ...theme.type.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 8,
  },
  useLocationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.backgroundMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionsList: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
    overflow: "hidden",
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  suggestionText: { ...theme.type.body, color: theme.colors.textPrimary, flex: 1 },
  weatherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 0,
  },
  weatherText: { ...theme.type.caption, color: theme.colors.textSecondary, flex: 1 },
  advisoryBox: {
    marginTop: 10,
    backgroundColor: theme.colors.primary + "14",
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  advisoryHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 10 },
  advisoryText: { ...theme.type.caption, color: theme.colors.textPrimary, flex: 1 },
  advisoryActions: { flexDirection: "row", gap: 10 },
  advisoryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  advisoryBtnActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  advisoryBtnText: { ...theme.type.caption, color: theme.colors.primary, fontWeight: "600" },
  advisoryBtnTextActive: { color: theme.colors.onPrimary },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chipsRowTight: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: theme.colors.backgroundMuted,
  },
  chipActive: { backgroundColor: theme.colors.primary },
  chipText: { ...theme.type.caption, color: theme.colors.textSecondary, fontWeight: "500" },
  chipTextActive: { color: theme.colors.onPrimary },
  keyQuestionBlock: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 16,
  },
  keyQuestionTitle: { ...theme.type.caption, color: theme.colors.textSecondary, fontWeight: "700" },
  keyQuestionSub: { ...theme.type.body, color: theme.colors.textPrimary, fontWeight: "700", marginTop: 4, marginBottom: 10 },
  keyQuestionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  keyChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.backgroundMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  keyChipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  keyChipText: { ...theme.type.caption, color: theme.colors.primary, fontWeight: "700" },
  keyChipTextActive: { color: theme.colors.onPrimary },
  whoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  whoCard: {
    flexGrow: 1,
    minWidth: 140,
    flexBasis: "31%",
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  whoCardActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  whoCardTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  whoIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  whoIconWrapActive: { backgroundColor: "rgba(255,255,255,0.22)", borderColor: "rgba(255,255,255,0.22)" },
  whoTitle: { ...theme.type.caption, color: theme.colors.textPrimary, fontWeight: "800" },
  whoTitleActive: { color: theme.colors.onPrimary },
  whoSub: { ...theme.type.caption, color: theme.colors.textSecondary },
  whoSubActive: { color: "rgba(255,255,255,0.9)" },
  dateRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  dateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: 10,
    padding: 12,
  },
  dateBtnText: { ...theme.type.body, color: theme.colors.textPrimary },
  pickerOverlay: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "flex-end" },
  pickerSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  pickerTitle: { ...theme.type.body, fontWeight: "600", color: theme.colors.textPrimary, marginBottom: 12 },
  pickerItem: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  pickerItemActive: { backgroundColor: theme.colors.primary },
  pickerItemText: { ...theme.type.body, color: theme.colors.textPrimary },
  pickerItemTextActive: { color: theme.colors.onPrimary, fontWeight: "600" },
  pickerDone: { alignSelf: "flex-end", marginTop: 8 },
  pickerDoneText: { ...theme.type.button, color: theme.colors.primary },
  budgetRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  budgetInput: {
    flex: 1,
    ...theme.type.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 10,
  },
  currencyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 72,
  },
  currencyText: { ...theme.type.body, color: theme.colors.textPrimary, fontWeight: "600" },
  optionalInput: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  });
}
