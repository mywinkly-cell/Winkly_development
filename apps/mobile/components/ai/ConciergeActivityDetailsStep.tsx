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
} from "react-native";
import { useTranslation } from "react-i18next";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout, Shadow } from "@/constants/tokens";
import { GestureScrollView } from "@/components/ui/GestureScrollView";
import {
  getWeatherForCityAndDate,
  getWeatherForCityAndDateRange,
  searchLocationAutocomplete,
  buildWeatherTimeOptions,
  formatWeatherDisplayText,
  type WeatherSnapshot,
  type LocationSuggestion,
} from "@/lib/weatherClient";
import { getDeviceLocationDisplay } from "@/lib/location/deviceLocation";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import {
  type ActivityDetails,
  type ActivityCategory,
  type CategoryDetailsVariant,
  type CategoryExtras,
  type DatePreset,
  type TimeOfDay,
  type WhoJoining,
  BUDGET_QUICK_AMOUNTS,
  getCurrencySymbol,
  getInlineHint,
} from "@/lib/ai/conciergePlanningFlow";
import type { Mode } from "@/types";
import { supabase } from "@/lib/supabase";
import {
  buildProfileAwareSuggestionChips,
  loadProfileAwareSuggestionChips,
} from "@/lib/ai/customPlanPresets";

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

const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "weekend", label: "Weekend" },
  { key: "custom", label: "Custom" },
];

const TIME_OPTIONS: { key: TimeOfDay; label: string }[] = [
  { key: "any", label: "Any time" },
  { key: "morning", label: "Morning" },
  { key: "lunch", label: "Lunch" },
  { key: "afternoon", label: "Afternoon" },
  { key: "evening", label: "Evening" },
];

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
}: ConciergeActivityDetailsStepProps) {
  const { i18n } = useTranslation();
  const appLanguage = i18n?.language ?? "en";
  const [location, setLocation] = useState(() =>
    normalizeLocationDisplayString(initialDetails.location ?? "", appLanguage)
  );
  /** True after user taps the locate button; cleared when they edit the field or pick from list. */
  const [locationFromGps, setLocationFromGps] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [, setLocationLoading] = useState(false);
  const [deviceLocationLoading, setDeviceLocationLoading] = useState(false);
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
  const [budgetCurrency, setBudgetCurrency] = useState(initialDetails.budgetCurrency ?? "EUR");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDateEndPicker, setShowDateEndPicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
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
    return d;
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

  // Location autocomplete
  useEffect(() => {
    const q = location.trim();
    if (q.length < 2) {
      setLocationSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      setLocationLoading(true);
      searchLocationAutocomplete(q, appLanguage)
        .then(setLocationSuggestions)
        .finally(() => setLocationLoading(false));
    }, 280);
    return () => clearTimeout(t);
  }, [location, appLanguage]);

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

  const handleNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const locLine = normalizeLocationDisplayString(location, appLanguage);
    const parsed = parseLocation(locLine, appLanguage);
    const pad = (n: number) => String(n).padStart(2, "0");
    const exactTimeHm =
      singleDay && exactTimeEnabled ? `${pad(exactTime.getHours())}:${pad(exactTime.getMinutes())}` : undefined;
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
        title: "Vibe",
        subtitle: "",
        options: [
          { id: "cozy", label: "Cozy" },
          { id: "romantic", label: "Romantic" },
          { id: "lively", label: "Lively" },
          { id: "chic", label: "Chic" },
          { id: "casual", label: "Casual" },
        ] as const,
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
        title: "Goal",
        subtitle: "What’s the goal?",
        options: [
          { id: "intro", label: "Quick intro" },
          { id: "catchup", label: "Catch up" },
          { id: "work", label: "Work chat" },
          { id: "pitch", label: "Pitch / deal" },
          { id: "network", label: "Network" },
        ] as const,
        selected: (categoryExtras?.meetingGoal || "").trim(),
        onSelect: (label: string) => {
          Haptics.selectionAsync();
          setExtra("meetingGoal", label);
        },
      };
    }
    if (activityKey === "sport_activity" || activityKey === "sport") {
      const opts = (activityCategory?.subActivities ?? []).filter((x) => x && x !== "Surprise me");
      const fallback = ["Tennis / padel", "Bowling", "Cycling route", "Evening stroll", "Indoor climbing"];
      const list = (opts.length ? opts : fallback).slice(0, 6);
      return {
        title: "Type",
        subtitle: "What type of activity?",
        options: list.map((label, idx) => ({ id: String(idx), label })),
        selected: (categoryExtras?.sportSubType || "").trim(),
        onSelect: (label: string) => {
          Haptics.selectionAsync();
          setExtra("sportSubType", label);
        },
      };
    }
    if (activityKey === "art_culture") {
      const opts = (activityCategory?.subActivities ?? []).filter((x) => x && x !== "Surprise me");
      const list = (opts.length ? opts : ["Museum / gallery", "Theatre / show", "Cinema", "Exhibition"]).slice(0, 6);
      return {
        title: "Type",
        subtitle: "What kind of culture?",
        options: list.map((label, idx) => ({ id: String(idx), label })),
        selected: (categoryExtras?.artSubType || "").trim(),
        onSelect: (label: string) => {
          Haptics.selectionAsync();
          setExtra("artSubType", label);
        },
      };
    }
    return null;
  }, [activityKey, activityCategory?.subActivities, categoryExtras?.artSubType, categoryExtras?.atmosphere, categoryExtras?.meetingGoal, categoryExtras?.sportSubType, setExtra, showFoodFields]);

  const cuisineChips = useMemo(
    () => ["Italian", "Japanese", "Mexican", "Thai", "Indian", "French", "Greek", "Korean", "Spanish", "Other…"],
    []
  );

  const locationHint = getInlineHint("location", {
    hasLocation: !!location.trim(),
    locationFromGps,
  });

  return (
    <GestureScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {showInlineBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backRow} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={22} color={Colors.primaryViolet} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      ) : null}

      {showProfilePrompt ? (
        <View style={styles.customPromptBlock}>
          <Text style={styles.customPromptLabel}>
            Is there any specific idea or request on your mind? Please add for a better planning.
          </Text>
          <TextInput
            style={styles.customPromptInput}
            value={customPromptExtra}
            onChangeText={setCustomPromptExtra}
            placeholder="e.g. concert then café, group of 4, budget-friendly…"
            placeholderTextColor={Colors.gray500}
            multiline
            textAlignVertical="top"
            maxLength={600}
          />
          <Text style={styles.customChipsLabel}>
            {customChipsLoading ? "Building suggestions from your profile…" : "Suggestions for you"}
          </Text>
          {customChipsLoading ? (
            <ActivityIndicator color={Colors.primaryViolet} style={{ marginVertical: 12 }} />
          ) : (
            <View style={styles.customChipWrap}>
              {customChips.map((line, i) => (
                <TouchableOpacity
                  key={`c-${i}-${line.slice(0, 20)}`}
                  style={styles.customChipRow}
                  onPress={() => appendCustomChip(line)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="add-circle-outline" size={18} color={Colors.primaryViolet} />
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

      {subTopicLabel?.trim() ? (
        <View style={styles.topicHero}>
          <Text style={styles.topicHeroLabel}>Topic</Text>
          <Text style={styles.topicHeroTitle} numberOfLines={1}>
            {subTopicLabel.trim()}
            {subActivityLabel?.trim() ? ` — ${subActivityLabel.trim()}` : ""}
          </Text>
        </View>
      ) : null}

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Who’s joining?</Text>
        </View>
        <View style={styles.surfaceCard}>
          <View style={styles.whoGrid}>
            {([
              { key: "just_me" as const, title: "Solo", sub: "Just for me", icon: "person-outline" as const },
              { key: "share" as const, title: "With someone", sub: "Invite or share", icon: "people-outline" as const },
              { key: "decide_later" as const, title: "Decide later", sub: "Keep it flexible", icon: "time-outline" as const },
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
                      <Ionicons name={opt.icon} size={18} color={active ? Colors.white : Colors.primaryViolet} />
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

      {/* Key question (dominant choice) */}
      {keyQuestion ? (
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
                    <Text style={[styles.keyChipText, active && styles.keyChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Location</Text>
          <TouchableOpacity
            style={styles.locatePillBtn}
            onPress={() => {
              if (deviceLocationLoading) return;
              Haptics.selectionAsync();
              setDeviceLocationLoading(true);
              getDeviceLocationDisplay(appLanguage).then((res) => {
                if (res.ok && res.display) {
                  setLocation(normalizeLocationDisplayString(res.display, appLanguage));
                  setLocationFromGps(true);
                }
                setDeviceLocationLoading(false);
              });
            }}
            disabled={deviceLocationLoading}
            activeOpacity={0.85}
          >
            {deviceLocationLoading ? (
              <ActivityIndicator size="small" color={Colors.primaryViolet} />
            ) : (
              <>
                <Ionicons name="locate" size={18} color={Colors.primaryViolet} />
                <Text style={styles.locatePillBtnText}>Use current</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.surfaceCard}>
          <TextInput
            style={styles.textField}
            placeholder="City, Country"
            placeholderTextColor={Colors.gray500}
            value={location}
            onChangeText={(text) => {
              setLocationFromGps(false);
              setLocation(text);
            }}
            onFocus={() => setShowLocationDropdown(true)}
            onBlur={() => {
              setLocation((prev) => normalizeLocationDisplayString(prev, appLanguage));
              setTimeout(() => setShowLocationDropdown(false), 200);
            }}
          />

          {locationSuggestions.length > 0 && showLocationDropdown ? (
            <View style={styles.suggestionsList}>
              {locationSuggestions.slice(0, 5).map((s) => (
                <TouchableOpacity
                  key={s.display}
                  style={styles.suggestionItem}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setLocationFromGps(false);
                    setLocation(s.display);
                    setLocationSuggestions([]);
                  }}
                  activeOpacity={0.85}
                >
                  <Ionicons name="location-outline" size={18} color={Colors.gray500} />
                  <Text style={styles.suggestionText} numberOfLines={1}>{s.display}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {locationHint ? <Text style={styles.inlineHint}>{locationHint}</Text> : null}
        </View>
      </View>

      {cityPart ? (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Weather</Text>
          </View>
          <View style={styles.surfaceCard}>
            <View style={styles.weatherRow}>
              {weatherLoading ? (
                <ActivityIndicator size="small" color={Colors.primaryViolet} />
              ) : weatherSnapshot ? (
                <>
                  <Ionicons name="partly-sunny-outline" size={18} color={Colors.gray600} />
                  <Text style={styles.weatherText}>
                    {formatWeatherDisplayText(weatherSnapshot, { singleDay, dateLabel: dateStr })}
                  </Text>
                </>
              ) : (
                <Text style={styles.weatherText}>Weather unavailable for this location.</Text>
              )}
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Date</Text>
        </View>
        <View style={styles.surfaceCard}>
          <View style={[styles.chipsRow, { marginBottom: 0 }]}>
            {DATE_PRESETS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, datePreset === key && styles.chipActive]}
                onPress={() => applyDatePreset(key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, datePreset === key && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {(datePreset === "custom" || datePreset === "weekend") ? (
            <View style={[styles.dateRow, { marginTop: 12, marginBottom: 0 }]}>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)} activeOpacity={0.85}>
                <Ionicons name="calendar-outline" size={18} color={Colors.gray600} />
                <Text style={styles.dateBtnText}>
                  {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </Text>
              </TouchableOpacity>
              {!singleDay && activityKey !== "trip" ? (
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDateEndPicker(true)} activeOpacity={0.85}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.gray600} />
                  <Text style={styles.dateBtnText}>
                    To: {dateEnd.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      {activityKey === "trip" && (
        <>
          <Text style={styles.label}>Trip length</Text>
          <Text style={styles.inlineHint}>Choose how many days — we’ll shape an itinerary for each day.</Text>
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
                  {n === 1 ? "1 day" : `${n} days`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {tripLengthDays > 1 ? (
            <Text style={styles.changeHint}>
              Ends{" "}
              {dateEnd.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </Text>
          ) : null}
        </>
      )}
      {showDatePicker && (
        <Modal visible transparent animationType="fade">
          <Pressable style={styles.pickerOverlay} onPress={() => setShowDatePicker(false)}>
            <View style={styles.pickerSheet}>
              <DateTimePicker
                value={date}
                mode="date"
                display="spinner"
                onChange={(_, d) => d && setDate(d)}
                minimumDate={new Date()}
              />
              <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.pickerDone}>
                <Text style={styles.pickerDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}
      {showDateEndPicker && (
        <Modal visible transparent animationType="fade">
          <Pressable style={styles.pickerOverlay} onPress={() => setShowDateEndPicker(false)}>
            <View style={styles.pickerSheet}>
              <DateTimePicker
                value={dateEnd}
                mode="date"
                display="spinner"
                onChange={(_, d) => d && setDateEnd(d)}
                minimumDate={date}
              />
              <TouchableOpacity onPress={() => setShowDateEndPicker(false)} style={styles.pickerDone}>
                <Text style={styles.pickerDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}
      {showExactTimePicker && (
        <Modal visible transparent animationType="fade">
          <Pressable style={styles.pickerOverlay} onPress={() => setShowExactTimePicker(false)}>
            <View style={styles.pickerSheet}>
              <DateTimePicker
                value={exactTime}
                mode="time"
                display="spinner"
                onChange={(_, d) => d && setExactTime(d)}
              />
              <TouchableOpacity onPress={() => setShowExactTimePicker(false)} style={styles.pickerDone}>
                <Text style={styles.pickerDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Modal>
      )}

      {singleDay ? (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Time</Text>
          </View>
          <View style={styles.surfaceCard}>
          <View style={[styles.chipsRow, { marginBottom: 0 }]}>
            {TIME_OPTIONS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, timeOfDay === key && styles.chipActive]}
                onPress={() => { Haptics.selectionAsync(); setTimeOfDay(key); }}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, timeOfDay === key && styles.chipTextActive]}>{label}</Text>
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
              color={exactTimeEnabled ? Colors.primaryViolet : Colors.gray600}
            />
            <Text style={styles.locatePillBtnText}>Set exact start time</Text>
          </TouchableOpacity>

          {exactTimeEnabled ? (
            <TouchableOpacity
              style={[styles.dateBtn, { marginTop: 10, marginBottom: 0 }]}
              onPress={() => setShowExactTimePicker(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="time-outline" size={18} color={Colors.gray600} />
              <Text style={styles.dateBtnText}>
                {`${String(exactTime.getHours()).padStart(2, "0")}:${String(exactTime.getMinutes()).padStart(2, "0")}`}
              </Text>
            </TouchableOpacity>
          ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Budget</Text>
        </View>
        <View style={styles.surfaceCard}>
        <View style={[styles.chipsRow, { marginBottom: 12 }]}>
        {BUDGET_QUICK_AMOUNTS.map((amount) => {
          const symbol = getCurrencySymbol(budgetCurrency);
          const isActive = budgetAmount === String(amount);
          return (
            <TouchableOpacity
              key={amount}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => { Haptics.selectionAsync(); setBudgetAmount(String(amount)); }}
              activeOpacity={0.85}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{symbol}{amount}</Text>
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
            Custom
          </Text>
        </TouchableOpacity>
        </View>
        <View style={[styles.budgetRow, { marginBottom: 0 }]}>
        <TextInput
          style={styles.budgetInput}
          placeholder="Or enter amount (optional)"
          placeholderTextColor={Colors.gray500}
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
          <Ionicons name="chevron-down" size={16} color={Colors.gray600} />
        </TouchableOpacity>
      </View>
      </View>
      </View>
      <Modal visible={showCurrencyPicker} transparent animationType="fade">
        <Pressable style={styles.pickerOverlay} onPress={() => setShowCurrencyPicker(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>Currency</Text>
            {COMMON_CURRENCIES.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.pickerItem, budgetCurrency === c && styles.pickerItemActive]}
                onPress={() => { Haptics.selectionAsync(); setBudgetCurrency(c); setShowCurrencyPicker(false); }}
              >
                <Text style={[styles.pickerItemText, budgetCurrency === c && styles.pickerItemTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {showFoodFields ? (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Cuisine</Text>
          </View>
          <View style={styles.surfaceCard}>
            <View style={[styles.keyQuestionGrid, { marginBottom: 0 }]}>
              {cuisineChips.map((label) => {
                const active = cuisine === label || (label === "Other…" && customCuisineOpen);
                return (
                  <TouchableOpacity
                    key={label}
                    style={[styles.keyChip, active && styles.keyChipActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      if (label === "Other…") {
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
                    <Text style={[styles.keyChipText, active && styles.keyChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {customCuisineOpen ? (
              <TextInput
                style={[styles.textField, { marginTop: 12, marginBottom: 0 }]}
                placeholder="Type cuisine (e.g. Japanese, Italian)"
                placeholderTextColor={Colors.gray500}
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

      {showFoodFields ? (
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Indoor / outdoor</Text>
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
                    {key === "any" ? "Any" : key === "indoor" ? "Indoor" : "Outdoor"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.sectionCard}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Notes</Text>
        </View>
        <View style={styles.surfaceCard}>
          <TextInput
            style={[styles.textField, { minHeight: 90, marginBottom: 0, textAlignVertical: "top" }]}
            placeholder="Anything else the AI should know? (max 150)"
            placeholderTextColor={Colors.gray500}
            value={additionalInfo}
            onChangeText={setAdditionalInfo}
            multiline
            maxLength={150}
          />
        </View>
      </View>

      {/* Category extras — keep minimal for now (food fields already collected above). */}
      {detailsVariant === "food_drink" ? (
        <View style={{ marginTop: 4 }} />
      ) : null}

      <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.92}>
        <Text style={styles.nextBtnText}>Continue</Text>
      </TouchableOpacity>
    </GestureScrollView>
  );
}

const styles = StyleSheet.create({
  // Match Step 1 (Intent) feel: clean white canvas + section blocks.
  scroll: { flex: 1, backgroundColor: Colors.white },
  content: { paddingHorizontal: Layout.spacing.xl, paddingBottom: Layout.spacing.xxl, paddingTop: 6 },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  backText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" },
  // Hero stays as a premium card (topic anchor).
  topicHero: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.gray200,
    marginBottom: 18,
    ...Shadow.card,
  },
  topicHeroLabel: { ...Typography.caption, color: Colors.gray600, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  topicHeroTitle: { ...Typography.h3, color: Colors.textPrimary, marginTop: 4 },

  // Section block styling mirrors Step 1 (left accent border + uppercase label).
  sectionCard: {
    marginBottom: 20,
  },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 },
  sectionTitle: {
    ...Typography.caption,
    fontWeight: "800",
    color: Colors.gray600,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionSubTitle: { ...Typography.body, color: Colors.textPrimary, fontWeight: "700", marginBottom: 10 },

  // Standard surface card inside a section (same as Step 1 cards).
  surfaceCard: {
    backgroundColor: Colors.white,
    borderRadius: Layout.radii.card,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.gray200,
    ...Shadow.card,
  },
  locatePillBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  locatePillBtnText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "700" },
  textField: {
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
    marginBottom: 10,
  },
  subActivityBlock: { marginBottom: 20 },
  subActivityPrompt: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  customPromptBlock: { marginBottom: 20 },
  customPromptLabel: {
    ...Typography.caption,
    fontSize: 13,
    fontWeight: "400",
    color: Colors.gray500,
    marginBottom: 10,
    lineHeight: 20,
  },
  customPromptInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Layout.radii.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.white,
    marginBottom: 14,
  },
  customChipsLabel: {
    ...Typography.caption,
    fontWeight: "600",
    color: Colors.gray700,
    marginBottom: 10,
  },
  customChipWrap: { gap: 10, marginBottom: 8 },
  customChipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: Colors.white,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  customChipText: {
    ...Typography.caption,
    flex: 1,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  customDivider: {
    height: 1,
    backgroundColor: Colors.gray200,
    marginBottom: 20,
    marginTop: 8,
  },
  label: { ...Typography.caption, color: Colors.gray600, fontWeight: "600", marginBottom: 8 },
  changeHint: { ...Typography.caption, fontSize: 11, color: Colors.gray500, marginTop: 4 },
  inlineHint: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.gray500,
    marginTop: 4,
    marginBottom: 8,
    fontStyle: "italic",
  },
  // Legacy (kept until all callers removed)
  locationRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  locationInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 8,
  },
  useLocationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.gray100,
    alignItems: "center",
    justifyContent: "center",
  },
  suggestionsList: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
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
  suggestionText: { ...Typography.body, color: Colors.textPrimary, flex: 1 },
  weatherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 0,
  },
  weatherText: { ...Typography.caption, color: Colors.gray600, flex: 1 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chipsRowTight: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
  },
  chipActive: { backgroundColor: Colors.primaryViolet },
  chipText: { ...Typography.caption, color: Colors.gray700, fontWeight: "500" },
  chipTextActive: { color: Colors.white },
  keyQuestionBlock: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.gray200,
    marginBottom: 16,
  },
  keyQuestionTitle: { ...Typography.caption, color: Colors.gray600, fontWeight: "700" },
  keyQuestionSub: { ...Typography.body, color: Colors.textPrimary, fontWeight: "700", marginTop: 4, marginBottom: 10 },
  keyQuestionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  keyChip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: Colors.gray100,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  keyChipActive: { backgroundColor: Colors.primaryViolet, borderColor: Colors.primaryViolet },
  keyChipText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "700" },
  keyChipTextActive: { color: Colors.white },
  whoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  whoCard: {
    flexGrow: 1,
    minWidth: 140,
    flexBasis: "31%",
    backgroundColor: Colors.gray100,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  whoCardActive: { backgroundColor: Colors.primaryViolet, borderColor: Colors.primaryViolet },
  whoCardTop: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  whoIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  whoIconWrapActive: { backgroundColor: "rgba(255,255,255,0.22)", borderColor: "rgba(255,255,255,0.22)" },
  whoTitle: { ...Typography.caption, color: Colors.textPrimary, fontWeight: "800" },
  whoTitleActive: { color: Colors.white },
  whoSub: { ...Typography.caption, color: Colors.gray600 },
  whoSubActive: { color: "rgba(255,255,255,0.9)" },
  dateRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  dateBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.gray100,
    borderRadius: 10,
    padding: 12,
  },
  dateBtnText: { ...Typography.body, color: Colors.textPrimary },
  pickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  pickerSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  pickerTitle: { ...Typography.body, fontWeight: "600", color: Colors.textPrimary, marginBottom: 12 },
  pickerItem: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4 },
  pickerItemActive: { backgroundColor: Colors.primaryViolet },
  pickerItemText: { ...Typography.body, color: Colors.textPrimary },
  pickerItemTextActive: { color: Colors.white, fontWeight: "600" },
  pickerDone: { alignSelf: "flex-end", marginTop: 8 },
  pickerDoneText: { ...Typography.button, color: Colors.primaryViolet },
  budgetRow: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  budgetInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 10,
  },
  currencyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.gray100,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 72,
  },
  currencyText: { ...Typography.body, color: Colors.textPrimary, fontWeight: "600" },
  optionalInput: {
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  nextBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  nextBtnText: { ...Typography.button, color: Colors.white },
});
