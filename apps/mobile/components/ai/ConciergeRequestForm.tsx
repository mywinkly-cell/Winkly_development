// Concierge request form: freeform prompt + optional details (location, date, budget).
// Fetches weather for selected location/date and passes weather_snapshot to the AI.

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
  Modal,
  Pressable,
} from "react-native";
import { useTranslation } from "react-i18next";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Colors, Typography } from "@/constants/tokens";
import type { ConciergeContext } from "@/lib/ai/conciergeClient";
import { buildOriginContext } from "@/lib/ai/conciergeClient";
import { buildPlanRequestText } from "@/lib/ai/buildPlanRequestText";
import type { Mode } from "@/types";
import {
  getWeatherForCityAndDate,
  getWeatherForCityAndDateRange,
  searchLocationAutocomplete,
  type WeatherSnapshot,
  type LocationSuggestion,
} from "@/lib/weatherClient";
import { getPartnersForConcierge, searchWinklyUsersForInvite, type ConciergePartner } from "@/lib/ai/conciergePartners";
import { type RecentRequest } from "@/lib/ai/conciergeStorage";
import { getFreeEveningSlots } from "@/lib/ai/conciergeCalendar";
import { Avatar } from "@/components/ui/Avatar";
import { formatDefaultLocationDisplay, normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { supabase } from "@/lib/supabase";
import { loadPlanningProfileContext, formatSanitizedPersonaForConciergePrompt } from "@/lib/ai/customPlanPresets";
import { getDeviceLocationDisplay } from "@/lib/location/deviceLocation";

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a short phrase like "Dinner for two this Saturday under 50 euros" into prefill fields. */
function parseDescribePhrase(text: string): {
  prompt?: string;
  date?: Date;
  budgetAmount?: string;
  budgetCurrency?: string;
} {
  const t = text.trim();
  if (!t) return {};
  const out: { prompt?: string; date?: Date; budgetAmount?: string; budgetCurrency?: string } = {};
  let rest = t;

  const budgetMatch = rest.match(/(?:under|below|max)\s*(\d+)\s*(euros?|eur|€|usd|dollars?|gbp|chf|pln)/i)
    ?? rest.match(/(\d+)\s*(euros?|eur|€|usd|dollars?|gbp|chf|pln)/i);
  if (budgetMatch) {
    out.budgetAmount = budgetMatch[1];
    const c = (budgetMatch[2] || "").toLowerCase();
    out.budgetCurrency = c.startsWith("eur") || c.startsWith("euro") ? "EUR" : c.startsWith("usd") || c.startsWith("dollar") ? "USD" : c.startsWith("gbp") ? "GBP" : c.startsWith("chf") ? "CHF" : c.startsWith("pln") ? "PLN" : "EUR";
    rest = rest.replace(budgetMatch[0], "").replace(/\s+/g, " ").trim();
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (/\bthis\s+Saturday\b/i.test(rest)) {
    out.date = getNextSaturday(today);
    rest = rest.replace(/\bthis\s+Saturday\b/gi, "").trim();
  } else if (/\bnext\s+Saturday\b/i.test(rest)) {
    const d = getNextSaturday(today);
    d.setDate(d.getDate() + 7);
    out.date = d;
    rest = rest.replace(/\bnext\s+Saturday\b/gi, "").trim();
  } else if (/\bthis\s+weekend\b/i.test(rest)) {
    out.date = getNextSaturday(today);
    rest = rest.replace(/\bthis\s+weekend\b/gi, "").trim();
  } else if (/\btomorrow\b/i.test(rest)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    out.date = d;
    rest = rest.replace(/\btomorrow\b/gi, "").trim();
  } else if (/\bnext\s+week\b/i.test(rest)) {
    const d = getMonday(today);
    d.setDate(d.getDate() + 7);
    out.date = d;
    rest = rest.replace(/\bnext\s+week\b/gi, "").trim();
  }

  if (rest.length > 0) out.prompt = rest.replace(/\s+/g, " ").trim();
  return out;
}

/** Parse after normalizing ISO country segment (DE → Germany). */
function parseLocation(loc: string, language: string): { city: string; country: string | undefined } {
  const norm = normalizeLocationDisplayString(loc.trim(), language);
  if (!norm) return { city: "", country: undefined };
  const lastComma = norm.lastIndexOf(",");
  if (lastComma < 0) return { city: norm, country: undefined };
  const city = norm.slice(0, lastComma).trim();
  const country = norm.slice(lastComma + 1).trim();
  return { city, country: country || undefined };
}

type DateRangePreset = "single" | "weekend" | "next_weekend" | "week" | "next_week" | "custom";

function getMonday(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Next Saturday (or today if Saturday). */
function getNextSaturday(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  if (day === 6) return x;
  const daysUntilSat = day === 0 ? 6 : 6 - day;
  x.setDate(x.getDate() + daysUntilSat);
  return x;
}

/** Currency by city (lowercase) for default. EUR is initial state for most of Europe. */
const CITY_CURRENCY: Record<string, string> = {
  london: "GBP", "new york": "USD", "los angeles": "USD", chicago: "USD", miami: "USD", boston: "USD",
  zurich: "CHF", geneva: "CHF", bern: "CHF",
  warsaw: "PLN", krakow: "PLN",
  prague: "CZK", budapest: "HUF", bucharest: "RON", sofia: "BGN",
  oslo: "NOK", stockholm: "SEK", copenhagen: "DKK", reykjavik: "ISK",
  berlin: "EUR", munich: "EUR", paris: "EUR", amsterdam: "EUR", rome: "EUR", madrid: "EUR", vienna: "EUR",
};
const COMMON_CURRENCIES = ["EUR", "GBP", "USD", "CHF", "PLN", "CZK", "NOK", "SEK", "DKK"];

/** Quick-select activity chips per mode (Unified Architecture: "Activity/Prompt" with chips based on interests context). */
const ACTIVITY_CHIPS: Record<Mode, string[]> = {
  romance: ["Dinner date", "Coffee together", "Evening walk", "Cinema", "Weekend brunch", "Day trip"],
  friends: ["Brunch", "Sports or games", "Hike", "Drinks", "Concert", "Board games"],
  business: ["Coffee chat", "Lunch meeting", "Golf", "Working session", "Networking event"],
  events: ["Concert", "Workshop", "Nightlife", "Outdoor event", "Exhibition", "Meetup"],
};

export type ConciergeRequestFormProps = {
  mode: Mode;
  source_screen?: "planner" | "chats";
  source_planner_tab?: "all" | "dates" | "meetups" | "business" | "events";
  /** Default location as "City, Country" (e.g. from profile) — pre-fills the single location field. */
  defaultCity?: string;
  /** Default country; combined with defaultCity as "City, Country" when both set. */
  defaultCountry?: string;
  /** Called when user changes location, date, or other key fields so parent can clear error/result. */
  onClearError?: () => void;
  /** Called with full context to send to callConcierge. Parent does the API call. */
  onSubmit: (context: ConciergeContext) => void | Promise<void>;
  loading?: boolean;
  /** Compact = fewer labels, for modal. */
  compact?: boolean;
  /** When user selects/clears a partner for "With whom". Parent can use for invite step. */
  onPartnerChange?: (partner: { id: string; displayName: string } | null) => void;
  /** Pre-fill for refinement flow ("Make it cheaper", "Earlier time"). */
  refinementPlaceholder?: string;
  /** Show mode selector label (auto-set from sub-tab; planner only when compact). */
  showModeLabel?: boolean;
  /** Last 1–2 requests for "Recent ideas" re-run. */
  recentRequests?: RecentRequest[];
  /** One-time pre-fill for prompt (e.g. stale-chat nudge from Chats). */
  initialPrompt?: string;
  /** "decisive" = primary + backup; omit / "menu" = three options. */
  presentation?: "menu" | "decisive";
};

export function ConciergeRequestForm({
  mode,
  source_screen,
  source_planner_tab,
  defaultCity = "",
  defaultCountry = "",
  onClearError,
  onSubmit,
  loading = false,
  compact = false,
  onPartnerChange,
  refinementPlaceholder,
  showModeLabel = !!compact,
  recentRequests,
  initialPrompt,
  presentation,
}: ConciergeRequestFormProps) {
  const { i18n } = useTranslation();
  const appLanguage = i18n?.language ?? "en";
  const [prompt, setPrompt] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [timePreference, setTimePreference] = useState<string>("any");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [location, setLocation] = useState(() =>
    formatDefaultLocationDisplay(defaultCity, defaultCountry, appLanguage)
  );
  const defaultLocationApplied = useRef(false);
  const initialPromptApplied = useRef(false);
  const [locationSuggestions, setLocationSuggestions] = useState<LocationSuggestion[]>([]);
  const [locationSearchLoading, setLocationSearchLoading] = useState(false);
  const [date, setDate] = useState<Date>(() => new Date());
  const [dateEnd, setDateEnd] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>("single");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showDateEndPicker, setShowDateEndPicker] = useState(false);
  const [showDateRangePicker, setShowDateRangePicker] = useState(false);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("EUR");
  const [showDetails, setShowDetails] = useState(source_screen === "planner");
  const [weatherSnapshot, setWeatherSnapshot] = useState<WeatherSnapshot | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [partner, setPartner] = useState<ConciergePartner | null>(null);
  const [partners, setPartners] = useState<ConciergePartner[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [showPartnerPicker, setShowPartnerPicker] = useState(false);
  const [inviteSource, setInviteSource] = useState<"matches" | "search">("matches");
  const [inviteSearchQuery, setInviteSearchQuery] = useState("");
  const [inviteSearchResults, setInviteSearchResults] = useState<ConciergePartner[]>([]);
  const [inviteSearchLoading, setInviteSearchLoading] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  const [voiceInputText, setVoiceInputText] = useState("");

  const dateStr = dayKey(date);
  const dateEndStr = dayKey(dateEnd);

  // Pre-fill location when defaults load (e.g. from profile, async)
  useEffect(() => {
    if (!defaultLocationApplied.current && (defaultCity?.trim() || defaultCountry?.trim())) {
      defaultLocationApplied.current = true;
      setLocation(formatDefaultLocationDisplay(defaultCity, defaultCountry, appLanguage));
    }
  }, [defaultCity, defaultCountry, appLanguage]);

  useEffect(() => {
    if (!initialPromptApplied.current && initialPrompt?.trim()) {
      initialPromptApplied.current = true;
      setPrompt(initialPrompt.trim());
    }
  }, [initialPrompt]);

  // Notify parent to clear error/result when user changes key fields (so weather and form stay usable)
  const clearErrorDepsRef = useRef(false);
  useEffect(() => {
    if (!clearErrorDepsRef.current) {
      clearErrorDepsRef.current = true;
      return;
    }
    onClearError?.();
  }, [location, dateStr, dateEndStr, dateRangePreset, budgetCurrency, budgetAmount, onClearError]);

  // Default currency from location (city part for lookup)
  useEffect(() => {
    const { city: cityPart } = parseLocation(location, appLanguage);
    const key = cityPart.toLowerCase().replace(/\s+/g, " ");
    const curr = key ? CITY_CURRENCY[key] : null;
    if (curr) setBudgetCurrency(curr);
  }, [location]);

  // Debounced location autocomplete when user types
  useEffect(() => {
    const q = location.trim();
    if (q.length < 2) {
      setLocationSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      setLocationSearchLoading(true);
      searchLocationAutocomplete(q, appLanguage)
        .then((list) => setLocationSuggestions(list))
        .finally(() => setLocationSearchLoading(false));
    }, 280);
    return () => clearTimeout(t);
  }, [location, appLanguage]);

  // Debounced search for Invite → Search
  useEffect(() => {
    if (inviteSource !== "search") return;
    const q = inviteSearchQuery.trim();
    if (q.length < 2) {
      setInviteSearchResults([]);
      return;
    }
    const t = setTimeout(() => {
      setInviteSearchLoading(true);
      searchWinklyUsersForInvite(q, 20)
        .then(setInviteSearchResults)
        .finally(() => setInviteSearchLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [inviteSource, inviteSearchQuery]);

  // Fetch weather whenever location is set: single day or date range (avg temp, rain/sun probability)
  useEffect(() => {
    const { city: cityPart, country: countryPart } = parseLocation(location, appLanguage);
    if (!cityPart) {
      setWeatherSnapshot(null);
      return;
    }
    let cancelled = false;
    setWeatherLoading(true);
    if (dateRangePreset === "single") {
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
  }, [location, dateStr, dateEndStr, dateRangePreset]);

  const fetchPartners = useCallback(() => {
    if (mode === "events") return;
    setPartnersLoading(true);
    getPartnersForConcierge(mode)
      .then(setPartners)
      .finally(() => setPartnersLoading(false));
  }, [mode]);

  const buildContextAsync = useCallback(async (): Promise<ConciergeContext> => {
    const fromStr = dateStr;
    const toStr = dateRangePreset === "single" ? dateStr : dateEndStr;
    const amount = budgetAmount.trim() ? parseFloat(budgetAmount.replace(/,/g, ".")) : undefined;
    const tierFromAmount =
      amount != null && !Number.isNaN(amount)
        ? amount < 50
          ? ("low" as const)
          : amount < 150
            ? ("mid" as const)
            : ("high" as const)
        : undefined;
    const { city: cityPart, country: countryPart } = parseLocation(location, appLanguage);
    const weather_snapshot = weatherSnapshot
      ? {
          summary: weatherSnapshot.summary,
          temp_min: weatherSnapshot.temp_min,
          temp_max: weatherSnapshot.temp_max,
          precipitation: weatherSnapshot.precipitation,
          date: weatherSnapshot.date,
          period_summary: weatherSnapshot.period_summary,
          rainy_days: weatherSnapshot.rainy_days,
          total_days: weatherSnapshot.total_days,
          avg_temp_min: weatherSnapshot.avg_temp_min,
          avg_temp_max: weatherSnapshot.avg_temp_max,
        }
      : undefined;

    let sanitizedPersona = "";
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user?.id) {
      const pctx = await loadPlanningProfileContext(auth.user.id, mode);
      sanitizedPersona = formatSanitizedPersonaForConciergePrompt(pctx);
    }
    let originLocationLabel: string | undefined;
    const gps = await getDeviceLocationDisplay(appLanguage);
    if (gps.ok && gps.display?.trim()) {
      originLocationLabel = normalizeLocationDisplayString(gps.display, appLanguage);
    }

    const plan_request_text = buildPlanRequestText({
      mode,
      planningEntrySurface: source_screen === "planner" ? "planner" : "chats",
      activityOrTopic: prompt.trim() || "Plan",
      city: cityPart || undefined,
      country: countryPart,
      originLocationLabel,
      dateFrom: fromStr,
      dateTo: toStr,
      singleDay: dateRangePreset === "single",
      timePreference:
        dateRangePreset === "single" && timePreference !== "any" ? timePreference : undefined,
      availableSlots:
        dateRangePreset === "single" && availableSlots.length > 0 ? availableSlots : undefined,
      budgetAmount: amount != null && !Number.isNaN(amount) ? amount : undefined,
      budgetCurrency: budgetCurrency || undefined,
      budgetTier: tierFromAmount,
      weatherSnapshot: weather_snapshot,
      partnerDisplayName: partner?.displayName,
      sanitizedRequesterPersona: sanitizedPersona,
      extraNotes: extraNotes.trim() || undefined,
    });
    const ctx: ConciergeContext = {
      mode,
      source_screen,
      source_planner_tab,
      user_prompt: prompt.trim() || undefined,
      activity_hint: prompt.trim() || undefined,
      plan_request_text,
      city: cityPart || undefined,
      country: countryPart,
      date_from: fromStr,
      date_to: toStr,
      budget_tier: tierFromAmount,
      budget_amount: amount != null && !Number.isNaN(amount) ? amount : undefined,
      budget_currency: budgetCurrency || undefined,
      partner_user_id: partner?.id,
      time_preference: dateRangePreset === "single" && timePreference !== "any" ? timePreference : undefined,
      available_slots: dateRangePreset === "single" && availableSlots.length > 0 ? availableSlots : undefined,
      weather_snapshot,
      origin_context: buildOriginContext({
        source_screen: source_screen ?? "planner",
        mode,
        source_planner_tab,
        hasPartner: !!partner,
      }),
      ...(presentation ? { presentation } : {}),
      planning_entry_surface: source_screen === "planner" ? "planner" : "chats",
      origin_location_label: originLocationLabel,
      sanitized_requester_persona: sanitizedPersona || undefined,
    };
    return ctx;
  }, [mode, source_screen, source_planner_tab, prompt, extraNotes, location, dateStr, dateEndStr, dateRangePreset, budgetAmount, budgetCurrency, partner, weatherSnapshot, timePreference, availableSlots, appLanguage, presentation]);

  const handleSelectPartner = (p: ConciergePartner | null) => {
    Haptics.selectionAsync();
    setPartner(p);
    setShowPartnerPicker(false);
    onPartnerChange?.(p ? { id: p.id, displayName: p.displayName } : null);
  };

  const handleSubmit = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const ctx = await buildContextAsync();
    await Promise.resolve(onSubmit(ctx));
  };

  const canSubmit = true;

  const modeLabel =
    mode === "romance"
      ? "Dates"
      : mode === "friends"
        ? "Meet-ups"
        : mode === "business"
          ? "Business"
          : "Events";
  const chips = ACTIVITY_CHIPS[mode] ?? ACTIVITY_CHIPS.events;
  const { city: cityForAdvisory } = parseLocation(location, appLanguage);
  const showAdvisory =
    showDetails && cityForAdvisory && weatherSnapshot && source_screen === "planner";
  const rainAdvisory =
    showAdvisory &&
    ((dateRangePreset === "single" && (weatherSnapshot.precipitation ?? 0) > 2 && weatherSnapshot.date) ||
      (dateRangePreset !== "single" && (weatherSnapshot.rainy_days ?? 0) > 0));

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {showModeLabel && (
        <View style={styles.modeLabelRow}>
          <Text style={styles.modeLabelText}>
            {source_screen === "chats" ? "Suggestions for" : "Planning for"}: {modeLabel}
          </Text>
        </View>
      )}
      <Text style={styles.hint}>
        {source_screen === "chats"
          ? "Get a suggested first message, conversation starters, or date ideas to suggest in this chat. Planning with someone here? Use Invite to add them so suggestions fit you both."
          : compact
            ? "Describe what you want (e.g. “date night”, “weekend brunch”) or add details below."
            : "Write a short request or fill in the details. We’ll suggest options and show weather for your date and location."}
      </Text>
      {recentRequests && recentRequests.length > 0 && (
        <View style={styles.recentWrap}>
          <Text style={styles.recentLabel}>Recent ideas</Text>
          <View style={styles.recentChipsRow}>
            {recentRequests.slice(0, 2).map((r, i) => (
              <TouchableOpacity
                key={`${r.timestamp}-${i}`}
                style={styles.recentChip}
                onPress={() => {
                  Haptics.selectionAsync();
                  onSubmit(r.context);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="time-outline" size={16} color={Colors.primaryViolet} />
                <Text style={styles.recentChipText} numberOfLines={1}>{r.summary}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      {source_screen === "planner" && chips.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsContent}
        >
          {chips.map((label) => (
            <TouchableOpacity
              key={label}
              onPress={() => {
                Haptics.selectionAsync();
                setPrompt((p) => (p ? `${p}, ${label.toLowerCase()}` : label));
              }}
              style={styles.activityChip}
              activeOpacity={0.8}
            >
              <Text style={styles.activityChipText}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <View style={styles.promptRow}>
        <TextInput
          style={styles.promptInput}
          placeholder={
            refinementPlaceholder
              ? refinementPlaceholder
              : source_screen === "chats"
                ? "e.g. Suggest an opening line, What to do this weekend with my match, Fun topic to talk about"
                : "e.g. Plan a date, weekend brunch, something outdoors"
          }
          placeholderTextColor={Colors.gray500}
          value={prompt}
          onChangeText={setPrompt}
          multiline
          maxLength={300}
        />
        <TextInput
          style={[styles.promptInput, { minHeight: 56 }]}
          placeholder="Additional info (optional) — allergies, vibe, constraints…"
          placeholderTextColor={Colors.gray500}
          value={extraNotes}
          onChangeText={setExtraNotes}
          multiline
          maxLength={300}
        />
        <TouchableOpacity
          style={styles.voiceInputBtn}
          onPress={() => { Haptics.selectionAsync(); setVoiceInputText(""); setShowVoiceModal(true); }}
          activeOpacity={0.8}
        >
          <Ionicons name="mic-outline" size={24} color={Colors.primaryViolet} />
          <Text style={styles.voiceInputBtnText}>Say what you want</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showVoiceModal} transparent animationType="fade">
        <Pressable style={styles.voiceModalBackdrop} onPress={() => setShowVoiceModal(false)}>
          <Pressable style={styles.voiceModalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.voiceModalTitle}>Say what you want</Text>
            <Text style={styles.voiceModalHint}>e.g. Dinner for two this Saturday under 50 euros</Text>
            <TextInput
              style={styles.voiceModalInput}
              placeholder="Describe your plan in one sentence"
              placeholderTextColor={Colors.gray500}
              value={voiceInputText}
              onChangeText={setVoiceInputText}
              multiline
              autoFocus
            />
            <View style={styles.voiceModalActions}>
              <TouchableOpacity style={styles.voiceModalCancel} onPress={() => setShowVoiceModal(false)} activeOpacity={0.8}>
                <Text style={styles.voiceModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.voiceModalDone}
                onPress={() => {
                  Haptics.selectionAsync();
                  const parsed = parseDescribePhrase(voiceInputText);
                  if (parsed.prompt) setPrompt(parsed.prompt);
                  if (parsed.date) { setDate(parsed.date); setDateRangePreset("single"); }
                  if (parsed.budgetAmount) setBudgetAmount(parsed.budgetAmount);
                  if (parsed.budgetCurrency) setBudgetCurrency(parsed.budgetCurrency);
                  setShowVoiceModal(false);
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.voiceModalDoneText}>Pre-fill form</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <TouchableOpacity
        onPress={() => {
          Haptics.selectionAsync();
          setShowDetails((v) => !v);
        }}
        style={styles.detailsToggle}
        activeOpacity={0.8}
      >
        <Ionicons
          name={showDetails ? "chevron-up" : "chevron-down"}
          size={20}
          color={Colors.primaryViolet}
        />
        <Text style={styles.detailsToggleText}>
          {showDetails
            ? "Hide details"
            : source_screen === "chats"
              ? "Optional: add location, date or budget for context"
              : "Add location, date & budget"}
        </Text>
      </TouchableOpacity>

      {showDetails && (
        <View style={styles.details}>
          {rainAdvisory ? (
            <View style={styles.advisoryBox}>
              <Ionicons name="rainy-outline" size={20} color={Colors.primaryViolet} />
              <Text style={styles.advisoryText}>
                {dateRangePreset === "single"
                  ? `Note: ${weatherSnapshot.date} is forecast for rain in ${cityForAdvisory}. Consider indoor options or another day.`
                  : `Note: ${weatherSnapshot.rainy_days ?? 0} of ${weatherSnapshot.total_days ?? 0} days may have rain in ${cityForAdvisory}. Consider indoor options or flexible plans.`}
              </Text>
              <View style={styles.advisoryActions}>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync();
                    const next = new Date(date);
                    next.setDate(next.getDate() + 1);
                    setDate(next);
                  }}
                  style={styles.advisoryBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.advisoryBtnText}>Postpone a day</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync();
                    setPrompt((p) => (p ? `${p}, indoor` : "Indoor options"));
                  }}
                  style={styles.advisoryBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.advisoryBtnText}>Change activity</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          <Text style={styles.label}>Location</Text>
          <View style={styles.locationWrap}>
            <TextInput
              style={styles.locationInput}
              placeholder={defaultCity ? "Current location or type city, country" : "e.g. Berlin, Germany"}
              placeholderTextColor={Colors.gray500}
              value={location}
              onChangeText={setLocation}
              onFocus={() => {
                if (location.trim().length >= 2 && locationSuggestions.length === 0 && !locationSearchLoading) {
                  searchLocationAutocomplete(location.trim(), appLanguage).then(setLocationSuggestions);
                }
              }}
              onBlur={() => {
                setLocation((prev) => normalizeLocationDisplayString(prev, appLanguage));
                // Delay hiding so tap on suggestion registers
                setTimeout(() => setLocationSuggestions([]), 200);
              }}
              autoCapitalize="words"
              autoCorrect={false}
            />
            {locationSearchLoading && (
              <View style={styles.locationInputSpinner}>
                <ActivityIndicator size="small" color={Colors.primaryViolet} />
              </View>
            )}
            {locationSuggestions.length > 0 &&
              !(locationSuggestions.length === 1 && locationSuggestions[0].display === location) && (
              <View style={styles.locationSuggestionsList}>
                {locationSuggestions.slice(0, 6).map((s) => (
                  <TouchableOpacity
                    key={`${s.city}-${s.country}`}
                    style={styles.locationSuggestionItem}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setLocation(s.display);
                      setLocationSuggestions([]);
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="location-outline" size={18} color={Colors.gray500} />
                    <Text style={styles.locationSuggestionText} numberOfLines={1}>{s.display}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          {parseLocation(location, appLanguage).city && (
            <View style={styles.weatherRow}>
              {weatherLoading ? (
                <ActivityIndicator size="small" color={Colors.primaryViolet} />
              ) : weatherSnapshot ? (
                <>
                  <Ionicons name="partly-sunny-outline" size={18} color={Colors.gray600} />
                  <Text style={styles.weatherText}>
                    {dateRangePreset === "single"
                      ? `${dateStr}: ${weatherSnapshot.summary ?? ""}${weatherSnapshot.temp_min != null && weatherSnapshot.temp_max != null ? ` · ${weatherSnapshot.temp_min}–${weatherSnapshot.temp_max}°C` : ""}${weatherSnapshot.precipitation != null && weatherSnapshot.precipitation > 0 ? ` · ${weatherSnapshot.precipitation} mm rain` : ""}`
                      : `${weatherSnapshot.period_summary ?? ""}${weatherSnapshot.avg_temp_min != null && weatherSnapshot.avg_temp_max != null ? ` · Avg ${weatherSnapshot.avg_temp_min}–${weatherSnapshot.avg_temp_max}°C` : ""}${weatherSnapshot.rainy_days != null && weatherSnapshot.total_days != null ? ` · ${weatherSnapshot.rainy_days} of ${weatherSnapshot.total_days} days rainy` : ""}`}
                  </Text>
                </>
              ) : null}
            </View>
          )}
          <Text style={styles.label}>Date range</Text>
          <TouchableOpacity
            style={styles.dropdownTriggerFull}
            onPress={() => setShowDateRangePicker(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.dropdownTriggerText}>
              {dateRangePreset === "single"
                ? "Single day"
                : dateRangePreset === "weekend"
                  ? "This weekend"
                  : dateRangePreset === "next_weekend"
                    ? "Next weekend"
                    : dateRangePreset === "week"
                      ? "This week"
                      : dateRangePreset === "next_week"
                        ? "Next week"
                        : "Custom range"}
            </Text>
            <Ionicons name="chevron-down" size={18} color={Colors.gray600} />
          </TouchableOpacity>
          <Modal visible={showDateRangePicker} transparent animationType="fade">
            <Pressable style={styles.pickerOverlay} onPress={() => setShowDateRangePicker(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Date range</Text>
                {[
                  { key: "single" as const, label: "Single day" },
                  { key: "weekend" as const, label: "This weekend" },
                  { key: "next_weekend" as const, label: "Next weekend" },
                  { key: "week" as const, label: "This week" },
                  { key: "next_week" as const, label: "Next week" },
                  { key: "custom" as const, label: "Custom range" },
                ].map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setDateRangePreset(key);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      if (key === "single") {
                        setDate(today);
                        setDateEnd(today);
                      } else if (key === "weekend") {
                        const sat = getNextSaturday(today);
                        const sun = new Date(sat);
                        sun.setDate(sun.getDate() + 1);
                        setDate(sat);
                        setDateEnd(sun);
                      } else if (key === "next_weekend") {
                        const nextSat = getNextSaturday(today);
                        nextSat.setDate(nextSat.getDate() + 7);
                        const nextSun = new Date(nextSat);
                        nextSun.setDate(nextSun.getDate() + 1);
                        setDate(nextSat);
                        setDateEnd(nextSun);
                      } else if (key === "week") {
                        const mon = getMonday(today);
                        const sun = new Date(mon);
                        sun.setDate(sun.getDate() + 6);
                        setDate(mon);
                        setDateEnd(sun);
                      } else if (key === "next_week") {
                        const mon = getMonday(today);
                        mon.setDate(mon.getDate() + 7);
                        const sun = new Date(mon);
                        sun.setDate(sun.getDate() + 6);
                        setDate(mon);
                        setDateEnd(sun);
                      }
                      setShowDateRangePicker(false);
                    }}
                    style={[styles.pickerItem, dateRangePreset === key && styles.pickerItemActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.pickerItemText, dateRangePreset === key && styles.pickerItemTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Pressable>
          </Modal>
          <View style={styles.dateRangeRow}>
            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.dateBtn} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={20} color={Colors.gray600} />
              <Text style={styles.dateBtnText} numberOfLines={1}>
                From: {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
              </Text>
            </TouchableOpacity>
            {dateRangePreset !== "single" && (
              <TouchableOpacity onPress={() => setShowDateEndPicker(true)} style={[styles.dateBtn, styles.dateBtnSecond]} activeOpacity={0.8}>
                <Ionicons name="calendar-outline" size={20} color={Colors.gray600} />
                <Text style={styles.dateBtnText} numberOfLines={1}>
                  To: {dateEnd.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {showDatePicker && (
            <View style={styles.datePickerWrap}>
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, d) => {
                  if (d) setDate(d);
                  if (Platform.OS !== "ios") setShowDatePicker(false);
                }}
                minimumDate={new Date()}
              />
              {Platform.OS === "ios" && (
                <TouchableOpacity onPress={() => setShowDatePicker(false)} style={styles.datePickerDone}>
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          {showDateEndPicker && (
            <View style={styles.datePickerWrap}>
              <DateTimePicker
                value={dateEnd}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_, d) => {
                  if (d) setDateEnd(d);
                  if (Platform.OS !== "ios") setShowDateEndPicker(false);
                }}
                minimumDate={date}
              />
              {Platform.OS === "ios" && (
                <TouchableOpacity onPress={() => setShowDateEndPicker(false)} style={styles.datePickerDone}>
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <Text style={styles.label}>Budget</Text>
          <View style={styles.budgetAmountRow}>
            <TextInput
              style={styles.budgetAmountInput}
              placeholder="Amount (optional)"
              placeholderTextColor={Colors.gray500}
              value={budgetAmount}
              onChangeText={(t) => setBudgetAmount(t.replace(/[^0-9.,]/g, ""))}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={styles.currencyDropdownTrigger}
              onPress={() => {
                Haptics.selectionAsync();
                setShowCurrencyPicker(true);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.currencyDropdownText}>{budgetCurrency}</Text>
              <Ionicons name="chevron-down" size={16} color={Colors.gray600} />
            </TouchableOpacity>
          </View>
          <Modal visible={showCurrencyPicker} transparent animationType="fade">
            <Pressable style={styles.pickerOverlay} onPress={() => setShowCurrencyPicker(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>Currency</Text>
                {COMMON_CURRENCIES.map((curr) => (
                  <TouchableOpacity
                    key={curr}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setBudgetCurrency(curr);
                      setShowCurrencyPicker(false);
                    }}
                    style={[styles.pickerItem, budgetCurrency === curr && styles.pickerItemActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.pickerItemText, budgetCurrency === curr && styles.pickerItemTextActive]}>{curr}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Pressable>
          </Modal>

          {dateRangePreset === "single" && (
            <>
              <Text style={styles.label}>Part of the day</Text>
              <View style={styles.freeWhenRow}>
                {[
                  { key: "any", label: "Any time" },
                  { key: "morning", label: "Morning" },
                  { key: "lunchtime", label: "Lunchtime" },
                  { key: "afternoon", label: "Afternoon" },
                  { key: "evening", label: "Evening" },
                ].map(({ key, label }) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.freeWhenChip, timePreference === key && styles.freeWhenChipActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setTimePreference(key);
                      setAvailableSlots([]);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.freeWhenChipText, timePreference === key && styles.freeWhenChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.whenFreeBtn, (calendarLoading || availableSlots.length > 0) && styles.whenFreeBtnActive]}
                onPress={async () => {
                  Haptics.selectionAsync();
                  setCalendarLoading(true);
                  const slots = await getFreeEveningSlots();
                  setAvailableSlots(slots);
                  setTimePreference(slots.length > 0 ? "when_free" : timePreference);
                  setCalendarLoading(false);
                }}
                disabled={calendarLoading}
                activeOpacity={0.8}
              >
                {calendarLoading ? (
                  <ActivityIndicator size="small" color={Colors.primaryViolet} />
                ) : (
                  <>
                    <Ionicons name="calendar-outline" size={18} color={availableSlots.length > 0 ? Colors.white : Colors.primaryViolet} />
                    <Text style={[styles.whenFreeBtnText, availableSlots.length > 0 && styles.whenFreeBtnTextActive]}>
                      {availableSlots.length > 0 ? `Suggest when I'm free (${availableSlots.length} evenings)` : "Suggest when I am free"}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}

          {(source_screen === "chats" || source_screen === "planner") && (
            <>
              {partner ? (
                <View style={styles.partnerSelectedRow}>
                  <Avatar uri={partner.avatar_url} size={32} />
                  <Text style={styles.partnerName} numberOfLines={1}>{partner.displayName}</Text>
                  <TouchableOpacity onPress={() => handleSelectPartner(null)} hitSlop={8} accessibilityLabel="Clear">
                    <Ionicons name="close-circle" size={24} color={Colors.gray500} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.partnerBtn}
                  onPress={() => {
                    setShowPartnerPicker((v) => !v);
                    if (!showPartnerPicker && partners.length === 0) fetchPartners();
                    if (!showPartnerPicker) setInviteSearchQuery("");
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="person-add-outline" size={20} color={Colors.primaryViolet} />
                  <Text style={styles.partnerBtnText}>Invite</Text>
                </TouchableOpacity>
              )}
              {showPartnerPicker && (
                <View style={styles.invitePickerWrap}>
                  <View style={styles.inviteSourceRow}>
                    <TouchableOpacity
                      onPress={() => { Haptics.selectionAsync(); setInviteSource("matches"); }}
                      style={[styles.inviteSourceTab, inviteSource === "matches" && styles.inviteSourceTabActive]}
                    >
                      <Text style={[styles.inviteSourceTabText, inviteSource === "matches" && styles.inviteSourceTabTextActive]}>
                        {mode === "romance" ? "Matches" : "Connections"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { Haptics.selectionAsync(); setInviteSource("search"); }}
                      style={[styles.inviteSourceTab, inviteSource === "search" && styles.inviteSourceTabActive]}
                    >
                      <Text style={[styles.inviteSourceTabText, inviteSource === "search" && styles.inviteSourceTabTextActive]}>Search</Text>
                    </TouchableOpacity>
                  </View>
                  {inviteSource === "search" && (
                    <TextInput
                      style={[styles.input, { marginBottom: 8 }]}
                      placeholder="Search by name"
                      placeholderTextColor={Colors.gray500}
                      value={inviteSearchQuery}
                      onChangeText={setInviteSearchQuery}
                      autoCapitalize="words"
                    />
                  )}
                  <ScrollView style={styles.partnerList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {inviteSource === "matches"
                      ? (partnersLoading ? (
                          <ActivityIndicator size="small" color={Colors.primaryViolet} style={{ marginVertical: 12 }} />
                        ) : partners.length === 0 ? (
                          <Text style={styles.inviteEmptyText}>
                            {mode === "romance" ? "No matches yet." : "No connections yet."}
                          </Text>
                        ) : (
                          partners.map((p) => (
                            <TouchableOpacity key={p.id} style={styles.partnerRow} onPress={() => handleSelectPartner(p)} activeOpacity={0.8}>
                              <Avatar uri={p.avatar_url} size={36} />
                              <Text style={styles.partnerRowName} numberOfLines={1}>{p.displayName}</Text>
                            </TouchableOpacity>
                          ))
                        ))
                      : (inviteSearchLoading ? (
                          <ActivityIndicator size="small" color={Colors.primaryViolet} style={{ marginVertical: 12 }} />
                        ) : inviteSearchQuery.trim().length < 2 ? (
                          <Text style={styles.inviteEmptyText}>Type at least 2 characters to search.</Text>
                        ) : inviteSearchResults.length === 0 ? (
                          <Text style={styles.inviteEmptyText}>No one found.</Text>
                        ) : (
                          inviteSearchResults.map((p) => (
                            <TouchableOpacity key={p.id} style={styles.partnerRow} onPress={() => handleSelectPartner(p)} activeOpacity={0.8}>
                              <Avatar uri={p.avatar_url} size={36} />
                              <Text style={styles.partnerRowName} numberOfLines={1}>{p.displayName}</Text>
                            </TouchableOpacity>
                          ))
                        ))}
                  </ScrollView>
                </View>
              )}
            </>
          )}
        </View>
      )}

      <TouchableOpacity
        onPress={handleSubmit}
        style={[styles.submitBtn, (loading || !canSubmit) && styles.submitBtnDisabled]}
        disabled={loading || !canSubmit}
        activeOpacity={0.9}
      >
        {loading ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.submitBtnText}>
            {source_screen === "chats" ? "Get chat suggestions" : "Get suggestions"}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 24 },
  modeLabelRow: { marginBottom: 8 },
  modeLabelText: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "600",
  },
  chipsScroll: { marginHorizontal: -24, marginBottom: 12 },
  chipsContent: { paddingHorizontal: 24, flexDirection: "row", flexWrap: "wrap" },
  activityChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
    marginRight: 8,
    marginBottom: 8,
  },
  activityChipText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "500",
  },
  recentWrap: { marginBottom: 14 },
  recentLabel: {
    ...Typography.caption,
    color: Colors.gray600,
    fontWeight: "600",
    marginBottom: 8,
  },
  recentChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  recentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
  },
  recentChipText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "500",
    maxWidth: 160,
  },
  freeWhenRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  freeWhenChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
  },
  freeWhenChipActive: { backgroundColor: Colors.primaryViolet },
  freeWhenChipText: { ...Typography.caption, color: Colors.gray700, fontWeight: "500" },
  freeWhenChipTextActive: { color: Colors.white },
  whenFreeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.gray100,
    marginBottom: 16,
  },
  whenFreeBtnActive: { backgroundColor: Colors.primaryViolet },
  whenFreeBtnText: { ...Typography.caption, color: Colors.primaryViolet, fontWeight: "500" },
  whenFreeBtnTextActive: { color: Colors.white },
  advisoryBox: {
    flexDirection: "column",
    backgroundColor: Colors.romance.secondary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primaryViolet,
  },
  advisoryText: {
    ...Typography.caption,
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  advisoryActions: { flexDirection: "row", gap: 10 },
  advisoryBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: Colors.white,
  },
  advisoryBtnText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  hint: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 12,
  },
  promptRow: {
    marginBottom: 12,
  },
  promptInput: {
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    padding: 14,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 8,
  },
  voiceInputBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  voiceInputBtnText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  voiceModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  voiceModalCard: {
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 360,
  },
  voiceModalTitle: {
    ...Typography.h3,
    color: Colors.textPrimary,
    marginBottom: 8,
  },
  voiceModalHint: {
    ...Typography.caption,
    color: Colors.gray500,
    marginBottom: 16,
  },
  voiceModalInput: {
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    padding: 14,
    minHeight: 60,
    textAlignVertical: "top",
    marginBottom: 20,
  },
  voiceModalActions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
  voiceModalCancel: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  voiceModalCancelText: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  voiceModalDone: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  voiceModalDoneText: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: "600",
  },
  detailsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  detailsToggleText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  details: { marginBottom: 16 },
  label: {
    ...Typography.caption,
    color: Colors.gray600,
    marginBottom: 6,
  },
  input: {
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  locationWrap: {
    marginBottom: 12,
    position: "relative",
  },
  locationInput: {
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 40,
  },
  locationInputSpinner: {
    position: "absolute",
    right: 12,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  locationSuggestionsList: {
    marginTop: 6,
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.gray200,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
    overflow: "hidden",
  },
  locationSuggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray200,
  },
  locationSuggestionText: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  dropdownTriggerFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.gray100,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
  },
  dropdownTriggerText: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "70%",
  },
  pickerTitle: {
    ...Typography.body,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 12,
  },
  pickerList: { maxHeight: 320 },
  pickerItem: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  pickerItemActive: { backgroundColor: Colors.primaryViolet },
  pickerItemText: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  pickerItemTextActive: { color: Colors.white, fontWeight: "600" },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.gray100,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  dateBtnText: {
    ...Typography.body,
    color: Colors.textPrimary,
  },
  dateBtnSecond: { marginTop: 8 },
  datePickerWrap: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  datePickerDone: { alignSelf: "flex-end", marginTop: 8 },
  datePickerDoneText: {
    ...Typography.button,
    color: Colors.primaryViolet,
  },
  datePresetScroll: { marginHorizontal: -24, marginBottom: 10 },
  datePresetContent: { paddingHorizontal: 24, flexDirection: "row", flexWrap: "wrap" },
  datePresetChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: Colors.gray100,
    marginRight: 8,
    marginBottom: 8,
    flexShrink: 0,
    minWidth: 100,
  },
  datePresetChipActive: { backgroundColor: Colors.primaryViolet },
  datePresetChipText: { ...Typography.caption, color: Colors.gray600, fontWeight: "500" },
  datePresetChipTextActive: { color: Colors.white, fontWeight: "600" },
  dateRangeRow: { marginBottom: 12 },
  budgetAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  budgetAmountInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.textPrimary,
    backgroundColor: Colors.gray100,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 10,
  },
  currencyDropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.gray100,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 72,
  },
  currencyDropdownText: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: "600",
  },
  currencyChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 12,
  },
  currencyChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Colors.gray100,
    marginRight: 8,
    marginBottom: 6,
  },
  currencyChipActive: { backgroundColor: Colors.primaryViolet },
  currencyChipText: { ...Typography.caption, color: Colors.gray600 },
  currencyChipTextActive: { color: Colors.white, fontWeight: "600" },
  partnerSelectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.gray100,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  partnerName: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  partnerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.gray100,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  partnerBtnText: {
    ...Typography.caption,
    color: Colors.primaryViolet,
    fontWeight: "600",
  },
  invitePickerWrap: {
    backgroundColor: Colors.gray100,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    maxHeight: 220,
  },
  inviteSourceRow: { flexDirection: "row", marginBottom: 10 },
  inviteSourceTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: Colors.white,
  },
  inviteSourceTabActive: { backgroundColor: Colors.primaryViolet },
  inviteSourceTabText: { ...Typography.caption, color: Colors.gray600, fontWeight: "600" },
  inviteSourceTabTextActive: { color: Colors.white },
  inviteEmptyText: {
    ...Typography.caption,
    color: Colors.gray500,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  partnerList: {
    maxHeight: 160,
    marginBottom: 0,
  },
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  partnerRowName: {
    ...Typography.body,
    color: Colors.textPrimary,
    flex: 1,
  },
  weatherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  weatherText: {
    ...Typography.caption,
    color: Colors.gray600,
    flex: 1,
  },
  submitBtn: {
    backgroundColor: Colors.primaryViolet,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: {
    ...Typography.button,
    color: Colors.white,
  },
});
