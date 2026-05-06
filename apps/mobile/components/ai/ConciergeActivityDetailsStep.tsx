/**
 * Step 2 — Activity Details: location (device default), weather, date, time, budget.
 * Weather auto-refreshes when location, date, or time of day changes.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
  Platform,
} from "react-native";
import { useTranslation } from "react-i18next";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography, Layout } from "@/constants/tokens";
import {
  getWeatherForCityAndDate,
  getWeatherForCityAndDateRange,
  searchLocationAutocomplete,
  type WeatherSnapshot,
  type LocationSuggestion,
} from "@/lib/weatherClient";
import { getDeviceLocationDisplay } from "@/lib/location/deviceLocation";
import { normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import {
  type ActivityDetails,
  type ActivityCategory,
  type DatePreset,
  type TimeOfDay,
  BUDGET_QUICK_AMOUNTS,
  getCurrencySymbol,
  getInlineHint,
} from "@/lib/ai/conciergePlanningFlow";
import type { Mode } from "@/types";
import { supabase } from "@/lib/supabase";
import {
  loadPlanningProfileContext,
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
}: ConciergeActivityDetailsStepProps) {
  const { i18n } = useTranslation();
  const appLanguage = i18n?.language ?? "en";
  const [location, setLocation] = useState(() =>
    normalizeLocationDisplayString(initialDetails.location ?? "", appLanguage)
  );
  /** True after user taps the locate button; cleared when they edit the field or pick from list. */
  const [locationFromGps, setLocationFromGps] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
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
    return d;
  });
  const [showExactTimePicker, setShowExactTimePicker] = useState(false);

  const subActivities = activityCategory?.subActivities ?? [];
  const subActivityPrompt =
    activityCategory?.subActivityPrompt?.trim() ||
    (subActivities.length ? `What kind of ${activityCategory?.label.toLowerCase() ?? "plan"}?` : "");

  const [subActivityChoice, setSubActivityChoice] = useState<string>(() => {
    if (!subActivities.length) return "";
    return subActivities.includes("Surprise me") ? "Surprise me" : subActivities[0];
  });

  useEffect(() => {
    if (!subActivities.length) {
      setSubActivityChoice("");
      return;
    }
    setSubActivityChoice(subActivities.includes("Surprise me") ? "Surprise me" : subActivities[0]);
  }, [activityKey, activityCategory?.key]);

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
  }, [profilePromptVariant, mode]);

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
      getWeatherForCityAndDate(cityPart, dateStr, countryPart)
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
  }, [location, dateStr, dateEndStr, singleDay]);

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
    const specificsLine =
      subActivities.length && subActivityChoice
        ? `${activityCategory?.label ?? activityLabel ?? "Plan"}: ${subActivityChoice}.`
        : "";
    const mergedIntentNotes = [specificsLine, intentNotesText.trim()].filter(Boolean).join("\n\n");

    onNext({
      location: locLine,
      city: parsed.city || undefined,
      country: parsed.country,
      intentNotes: mergedIntentNotes || undefined,
      additionalInfo: additionalInfo.trim() || undefined,
      mustHaves: mustHaves.trim() || undefined,
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
      customPromptExtra: showProfilePrompt ? customPromptExtra.trim() || undefined : undefined,
      originLocationLabel: originLocationLabel.trim() || undefined,
      exactTimeHm,
    });
  };

  const showFoodFields =
    !!activityCategory?.foodRelated ||
    (!activityCategory &&
      !!activityLabel &&
      /dinner|brunch|coffee|lunch|wine|restaurant|cafe/i.test(activityLabel));

  const locationHint = getInlineHint("location", {
    hasLocation: !!location.trim(),
    locationFromGps,
  });

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
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
        <View style={{ marginBottom: 18 }}>
          <Text style={styles.customPromptLabel}>
            Is there any specific idea or request on your mind? Please add for a better planning.
          </Text>
          <TextInput
            style={styles.customPromptInput}
            value={additionalInfo}
            onChangeText={setAdditionalInfo}
            placeholder="e.g. specific venue, dietary needs, vibe, accessibility…"
            placeholderTextColor={Colors.gray500}
            multiline
            textAlignVertical="top"
            maxLength={600}
          />
        </View>
      )}

      <Text style={styles.stepTitle}>Activity details</Text>
      {activityLabel ? (
        <Text style={styles.activityLabel} numberOfLines={1}>{activityLabel}</Text>
      ) : null}

      {subActivities.length > 0 ? (
        <View style={styles.subActivityBlock}>
          <Text style={styles.subActivityPrompt}>{subActivityPrompt}</Text>
          <View style={styles.chipsRow}>
            {subActivities.map((opt) => {
              const active = subActivityChoice === opt;
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSubActivityChoice(opt);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={2}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Location */}
      <Text style={styles.label}>Location</Text>
      <View style={styles.locationRow}>
        <TextInput
          style={styles.locationInput}
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
        <TouchableOpacity
          style={styles.useLocationBtn}
          onPress={() => {
            if (deviceLocationLoading) return;
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
        >
          {deviceLocationLoading ? (
            <ActivityIndicator size="small" color={Colors.primaryViolet} />
          ) : (
            <Ionicons name="locate" size={20} color={Colors.primaryViolet} />
          )}
        </TouchableOpacity>
      </View>
      {locationSuggestions.length > 0 && showLocationDropdown && (
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
            >
              <Ionicons name="location-outline" size={18} color={Colors.gray500} />
              <Text style={styles.suggestionText} numberOfLines={1}>{s.display}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {locationHint ? <Text style={styles.inlineHint}>{locationHint}</Text> : null}

      {/* Weather */}
      {cityPart && (
        <View style={styles.weatherRow}>
          {weatherLoading ? (
            <ActivityIndicator size="small" color={Colors.primaryViolet} />
          ) : weatherSnapshot ? (
            <>
              <Ionicons name="partly-sunny-outline" size={20} color={Colors.gray600} />
              <Text style={styles.weatherText}>
                {singleDay
                  ? `${dateStr}: ${weatherSnapshot.summary ?? ""}${weatherSnapshot.temp_min != null && weatherSnapshot.temp_max != null ? ` · ${weatherSnapshot.temp_min}–${weatherSnapshot.temp_max}°C` : ""}`
                  : `${weatherSnapshot.period_summary ?? ""}${weatherSnapshot.avg_temp_min != null && weatherSnapshot.avg_temp_max != null ? ` · Avg ${weatherSnapshot.avg_temp_min}–${weatherSnapshot.avg_temp_max}°C` : ""}`}
              </Text>
            </>
          ) : null}
        </View>
      )}

      {/* Date */}
      <Text style={styles.label}>Date</Text>
      {getInlineHint("date", {}) ? (
        <Text style={styles.inlineHint}>{getInlineHint("date", {})}</Text>
      ) : null}
      <View style={styles.chipsRow}>
        {DATE_PRESETS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.chip, datePreset === key && styles.chipActive]}
            onPress={() => applyDatePreset(key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.chipText, datePreset === key && styles.chipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {(datePreset === "custom" || datePreset === "weekend") && (
        <View style={styles.dateRow}>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="calendar-outline" size={20} color={Colors.gray600} />
            <Text style={styles.dateBtnText}>
              {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </Text>
          </TouchableOpacity>
          {!singleDay && activityKey !== "trip" && (
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDateEndPicker(true)}>
              <Ionicons name="calendar-outline" size={20} color={Colors.gray600} />
              <Text style={styles.dateBtnText}>
                To: {dateEnd.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

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

      {/* Time of day (single day only) */}
      {singleDay && (
        <>
          <Text style={styles.label}>Time of day</Text>
          <View style={styles.chipsRow}>
            {TIME_OPTIONS.map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, timeOfDay === key && styles.chipActive]}
                onPress={() => { Haptics.selectionAsync(); setTimeOfDay(key); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, timeOfDay === key && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {timeOfDay !== "any" && getInlineHint("time", { activityLabel: activityLabel ?? undefined }) ? (
            <Text style={styles.inlineHint}>{getInlineHint("time", { activityLabel: activityLabel ?? undefined })}</Text>
          ) : null}
          <View style={{ marginTop: 12 }}>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setExactTimeEnabled((v) => !v);
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Ionicons
                name={exactTimeEnabled ? "checkbox" : "square-outline"}
                size={22}
                color={exactTimeEnabled ? Colors.primaryViolet : Colors.gray500}
              />
              <Text style={styles.label}>Set exact start time (HH:mm)</Text>
            </TouchableOpacity>
            {exactTimeEnabled ? (
              <>
                <TouchableOpacity
                  style={[styles.dateBtn, { marginTop: 8 }]}
                  onPress={() => setShowExactTimePicker(true)}
                >
                  <Ionicons name="time-outline" size={20} color={Colors.gray600} />
                  <Text style={styles.dateBtnText}>
                    {`${String(exactTime.getHours()).padStart(2, "0")}:${String(exactTime.getMinutes()).padStart(2, "0")}`}
                  </Text>
                </TouchableOpacity>
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
              </>
            ) : null}
          </View>
        </>
      )}

      {/* Budget */}
      <Text style={styles.label}>Budget</Text>
      <View style={styles.chipsRow}>
        {BUDGET_QUICK_AMOUNTS.map((amount) => {
          const symbol = getCurrencySymbol(budgetCurrency);
          const isActive = budgetAmount === String(amount);
          return (
            <TouchableOpacity
              key={amount}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => { Haptics.selectionAsync(); setBudgetAmount(String(amount)); }}
              activeOpacity={0.8}
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
          activeOpacity={0.8}
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
      <View style={styles.budgetRow}>
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
        >
          <Text style={styles.currencyText}>{budgetCurrency}</Text>
          <Ionicons name="chevron-down" size={16} color={Colors.gray600} />
        </TouchableOpacity>
      </View>
      {getInlineHint("budget", {}) ? (
        <Text style={styles.inlineHint}>{getInlineHint("budget", {})}</Text>
      ) : null}
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

      {/* Activity-specific (restaurant-like / food-led categories) */}
      {showFoodFields && (
        <>
          <Text style={styles.label}>Cuisine (optional)</Text>
          <TextInput
            style={styles.optionalInput}
            placeholder="e.g. Japanese, Italian"
            placeholderTextColor={Colors.gray500}
            value={cuisine}
            onChangeText={setCuisine}
          />
          {cuisine && getInlineHint("cuisine", { cuisine }) ? (
            <Text style={styles.inlineHint}>{getInlineHint("cuisine", { cuisine })}</Text>
          ) : null}
          <Text style={styles.label}>Atmosphere (optional)</Text>
          <TextInput
            style={styles.optionalInput}
            placeholder="e.g. Cozy, Romantic"
            placeholderTextColor={Colors.gray500}
            value={atmosphere}
            onChangeText={setAtmosphere}
          />
          <View style={styles.chipsRow}>
            {(["any", "indoor", "outdoor"] as const).map((key) => (
              <TouchableOpacity
                key={key}
                style={[styles.chip, indoorOutdoor === key && styles.chipActive]}
                onPress={() => { Haptics.selectionAsync(); setIndoorOutdoor(key); }}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, indoorOutdoor === key && styles.chipTextActive]}>
                  {key === "any" ? "Any" : key === "indoor" ? "Indoor" : "Outdoor"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.9}>
        <Text style={styles.nextBtnText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: Layout.spacing.xl, paddingBottom: Layout.spacing.xxl },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  backText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "600" },
  stepTitle: { ...Typography.h3, color: Colors.textPrimary, marginBottom: 4 },
  activityLabel: { ...Typography.caption, color: Colors.gray600, marginBottom: 10 },
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
    marginBottom: 16,
  },
  weatherText: { ...Typography.caption, color: Colors.gray600, flex: 1 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
  },
  chipActive: { backgroundColor: Colors.primaryViolet },
  chipText: { ...Typography.caption, color: Colors.gray700, fontWeight: "500" },
  chipTextActive: { color: Colors.white },
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
