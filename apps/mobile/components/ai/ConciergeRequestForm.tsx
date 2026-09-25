// Concierge request form: freeform prompt + optional details (location, date, budget).
// Fetches weather for selected location/date and passes weather_snapshot to the AI.

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { useAppLocaleTag } from "@/lib/i18n/appLocale";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { Layout } from "@/constants/tokens";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { Chip, PrimaryButton, TextButton } from "@/components/ds";
import type { ConciergeContext } from "@/lib/ai/conciergeClient";
import { buildOriginContext } from "@/lib/ai/conciergeClient";
import { buildPlanRequestText } from "@/lib/ai/buildPlanRequestText";
import type { Mode } from "@/types";
import {
  getWeatherForCityAndDate,
  getWeatherForCityAndDateRange,
  buildWeatherTimeOptions,
  formatWeatherDisplayText,
  weatherSnapshotToConciergePayload,
  type WeatherSnapshot,
} from "@/lib/weatherClient";
import { getPartnersForConcierge, searchWinklyUsersForInvite, type ConciergePartner } from "@/lib/ai/conciergePartners";
import { type RecentRequest } from "@/lib/ai/conciergeStorage";
import { getFreeEveningSlots } from "@/lib/ai/conciergeCalendar";
import { Avatar } from "@/components/ui/Avatar";
import { formatDefaultLocationDisplay, normalizeLocationDisplayString } from "@/lib/location/countryDisplay";
import { supabase } from "@/lib/supabase";
import { loadPlanningProfileContext, formatSanitizedPersonaForConciergePrompt } from "@/lib/ai/customPlanPresets";
import { getDeviceLocationDisplay } from "@/lib/location/deviceLocation";
import { useSafeAreaInsets } from "@/lib/useSafeAreaInsets";
import { PlanningLocationFields } from "@/components/ai/PlanningLocationFields";

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
  romance: ["dinnerDate", "coffeeTogether", "eveningWalk", "cinema", "weekendBrunch", "dayTrip"],
  friends: ["brunch", "sportsGames", "hike", "drinks", "concert", "boardGames"],
  business: ["coffeeChat", "lunchMeeting", "golf", "workingSession", "networkingEvent"],
  events: ["concert", "workshop", "nightlife", "outdoorEvent", "exhibition", "meetup"],
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
  /** Optional highlighted topic from a selected card (planner flow -> form). */
  selectedTopicLabel?: string | null;
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
  selectedTopicLabel,
}: ConciergeRequestFormProps) {
  const { t, i18n } = useTranslation();
  const appLanguage = i18n?.language ?? "en";
  const appLocale = useAppLocaleTag();
  const insets = useSafeAreaInsets();
  const theme = useAppTheme();
  const styles = useMemo(() => makeStyles(theme, mode), [theme, mode]);
  const [prompt, setPrompt] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [timePreference, setTimePreference] = useState<string>("any");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [location, setLocation] = useState(() =>
    formatDefaultLocationDisplay(defaultCity, defaultCountry, appLanguage)
  );
  const [searchRadiusKm, setSearchRadiusKm] = useState<number | null>(null);
  const [pinLatitude, setPinLatitude] = useState<number | null>(null);
  const [pinLongitude, setPinLongitude] = useState<number | null>(null);
  const [pinLabel, setPinLabel] = useState<string | null>(null);
  const defaultLocationApplied = useRef(false);
  const initialPromptApplied = useRef(false);
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
  const weatherTimeOptions = useMemo(
    () =>
      dateRangePreset === "single"
        ? buildWeatherTimeOptions({
            timeOfDay: timePreference,
            availableSlots,
            dateStr,
          })
        : undefined,
    [dateRangePreset, timePreference, availableSlots, dateStr]
  );

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
  }, [location, dateStr, dateEndStr, dateRangePreset, weatherTimeOptions, appLanguage]);

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
      ? weatherSnapshotToConciergePayload(weatherSnapshot)
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
      activityOrTopic: prompt.trim() || t("planner.untitledPlan"),
      city: cityPart || undefined,
      country: countryPart,
      latitude: pinLatitude ?? undefined,
      longitude: pinLongitude ?? undefined,
      pinLabel: pinLabel ?? undefined,
      searchRadiusKm: searchRadiusKm ?? undefined,
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
      latitude: pinLatitude ?? undefined,
      longitude: pinLongitude ?? undefined,
      search_radius_km: searchRadiusKm ?? undefined,
      pin_label: pinLabel ?? undefined,
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
  }, [mode, source_screen, source_planner_tab, prompt, extraNotes, location, searchRadiusKm, pinLatitude, pinLongitude, pinLabel, dateStr, dateEndStr, dateRangePreset, budgetAmount, budgetCurrency, partner, weatherSnapshot, timePreference, availableSlots, appLanguage, presentation, t]);

  const handleSelectPartner = (p: ConciergePartner | null) => {
    Haptics.selectionAsync();
    setPartner(p);
    setShowPartnerPicker(false);
    onPartnerChange?.(p ? { id: p.id, displayName: p.displayName } : null);
  };

  const handleSubmit = async () => {
    const { city: cityPart } = parseLocation(location, appLanguage);
    if (!cityPart.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const ctx = await buildContextAsync();
    await Promise.resolve(onSubmit(ctx));
  };

  const canSubmit =
    prompt.trim().length > 0 && parseLocation(location, appLanguage).city.trim().length > 0;

  const modeLabel =
    mode === "romance"
      ? t("planner.dates")
      : mode === "friends"
        ? t("planner.meetups")
        : mode === "business"
          ? t("planner.business")
          : t("planner.events");
  const chips = (ACTIVITY_CHIPS[mode] ?? ACTIVITY_CHIPS.events).map((id) => t(`concierge.form.chip.${id}`));
  // Note: the proactive rain advisory now lives in ConciergeActivityDetailsStep (the Planner
  // flow step). This form only renders for chat (non-planner) entry points, where the advisory
  // was unreachable, so it was removed here to avoid dead code.

  const footerReserve = Layout.touchTargetMin + 12 + 12 + Math.max(12, insets.bottom + 10);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: footerReserve }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="always"
      >
      {showModeLabel && (
        <View style={styles.modeLabelRow}>
          <Text style={styles.modeLabelText}>
            {source_screen === "chats"
              ? t("concierge.form.suggestionsFor", { mode: modeLabel })
              : t("concierge.form.planningFor", { mode: modeLabel })}
          </Text>
        </View>
      )}
      <Text style={styles.hint}>
        {source_screen === "chats"
          ? t("concierge.form.hintChats")
          : compact
            ? t("concierge.form.hintCompact")
            : t("concierge.form.hint")}
      </Text>

      {selectedTopicLabel?.trim() ? (
        <View style={styles.selectedTopicPill}>
          <Ionicons name="pricetag-outline" size={16} color={theme.colors.primary} />
          <Text style={styles.selectedTopicText} numberOfLines={1}>
            {t("concierge.form.topic", { topic: selectedTopicLabel.trim() })}
          </Text>
        </View>
      ) : null}
      {recentRequests && recentRequests.length > 0 && (
        <View style={styles.recentWrap}>
          <Text style={styles.recentLabel}>{t("concierge.form.recentIdeas")}</Text>
          <View style={styles.recentChipsRow}>
            {recentRequests.slice(0, 2).map((r, i) => (
              <Chip
                key={`${r.timestamp}-${i}`}
                label={r.summary}
                onPress={() => {
                  Haptics.selectionAsync();
                  onSubmit(r.context);
                }}
              />
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
            <Chip
              key={label}
              label={label}
              onPress={() => {
                Haptics.selectionAsync();
                setPrompt((p) => (p ? `${p}, ${label.toLowerCase()}` : label));
              }}
            />
          ))}
        </ScrollView>
      )}
      <View style={styles.promptRow}>
        <Text style={styles.fieldLabel}>{t("concierge.form.whatPlanning")}</Text>
        <TextInput
          style={[styles.promptInput, styles.promptPrimary]}
          placeholder={
            refinementPlaceholder
              ? refinementPlaceholder
              : source_screen === "chats"
                ? t("concierge.form.placeholderChats")
                : t("concierge.form.placeholder")
          }
          placeholderTextColor={theme.colors.textMuted}
          value={prompt}
          onChangeText={setPrompt}
          multiline
          maxLength={300}
        />
        <TextButton
          title={t("concierge.form.sayWhatYouWant")}
          icon={<Ionicons name="mic-outline" size={22} color={theme.colors.primary} />}
          onPress={() => { setVoiceInputText(""); setShowVoiceModal(true); }}
          style={styles.voiceInputBtn}
        />
      </View>

      <Modal visible={showVoiceModal} transparent animationType="fade">
        <Pressable style={styles.voiceModalBackdrop} onPress={() => setShowVoiceModal(false)}>
          <Pressable style={styles.voiceModalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.voiceModalTitle}>{t("concierge.form.sayWhatYouWant")}</Text>
            <Text style={styles.voiceModalHint}>{t("concierge.form.voiceHint")}</Text>
            <TextInput
              style={styles.voiceModalInput}
              placeholder={t("concierge.form.voicePlaceholder")}
              placeholderTextColor={theme.colors.textMuted}
              value={voiceInputText}
              onChangeText={setVoiceInputText}
              multiline
              autoFocus
            />
            <View style={styles.voiceModalActions}>
              <TouchableOpacity style={styles.voiceModalCancel} onPress={() => setShowVoiceModal(false)} activeOpacity={0.8}>
                <Text style={styles.voiceModalCancelText}>{t("common.cancel")}</Text>
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
                <Text style={styles.voiceModalDoneText}>{t("concierge.form.prefill")}</Text>
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
          color={theme.colors.primary}
        />
        <Text style={styles.detailsToggleText}>
          {showDetails
            ? t("concierge.form.hideDetails")
            : source_screen === "chats"
              ? t("concierge.form.addDetailsChats")
              : t("concierge.form.addDetails")}
        </Text>
      </TouchableOpacity>

      {showDetails && (
        <View style={styles.details}>
          <Text style={styles.fieldLabel}>{t("concierge.form.extraNotes")}</Text>
          <TextInput
            style={[styles.promptInput, styles.promptSecondary]}
            placeholder={t("concierge.form.extraNotesPlaceholder")}
            placeholderTextColor={theme.colors.textMuted}
            value={extraNotes}
            onChangeText={setExtraNotes}
            multiline
            maxLength={300}
          />
          <PlanningLocationFields
            value={{
              location,
              searchRadiusKm,
              latitude: pinLatitude,
              longitude: pinLongitude,
              pinLabel,
            }}
            onChange={(next) => {
              setLocation(next.location);
              setSearchRadiusKm(next.searchRadiusKm ?? null);
              setPinLatitude(next.latitude ?? null);
              setPinLongitude(next.longitude ?? null);
              setPinLabel(next.pinLabel ?? null);
            }}
            language={appLanguage}
            compact
          />
          {parseLocation(location, appLanguage).city && (
            <View style={styles.weatherRow}>
              {weatherLoading ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : weatherSnapshot ? (
                <>
                  <Ionicons name="partly-sunny-outline" size={18} color={theme.colors.textSecondary} />
                  <Text style={styles.weatherText}>
                    {formatWeatherDisplayText(weatherSnapshot, {
                      singleDay: dateRangePreset === "single",
                      dateLabel: dateStr,
                    })}
                  </Text>
                </>
              ) : null}
            </View>
          )}
          <Text style={styles.label}>{t("concierge.form.dateRange")}</Text>
          <TouchableOpacity
            style={styles.dropdownTriggerFull}
            onPress={() => setShowDateRangePicker(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.dropdownTriggerText}>
              {t(`concierge.form.range.${dateRangePreset}`)}
            </Text>
            <Ionicons name="chevron-down" size={18} color={theme.colors.textSecondary} />
          </TouchableOpacity>
          <Modal visible={showDateRangePicker} transparent animationType="fade">
            <Pressable style={styles.pickerOverlay} onPress={() => setShowDateRangePicker(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>{t("concierge.form.dateRange")}</Text>
                {(["single", "weekend", "next_weekend", "week", "next_week", "custom"] as const).map((key) => (
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
                    <Text style={[styles.pickerItemText, dateRangePreset === key && styles.pickerItemTextActive]}>{t(`concierge.form.range.${key}`)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Pressable>
          </Modal>
          <View style={styles.dateRangeRow}>
            <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.dateBtn} activeOpacity={0.8}>
              <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
              <Text style={styles.dateBtnText} numberOfLines={1}>
                {t("concierge.form.from", { date: date.toLocaleDateString(appLocale, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) })}
              </Text>
            </TouchableOpacity>
            {dateRangePreset !== "single" && (
              <TouchableOpacity onPress={() => setShowDateEndPicker(true)} style={[styles.dateBtn, styles.dateBtnSecond]} activeOpacity={0.8}>
                <Ionicons name="calendar-outline" size={20} color={theme.colors.textSecondary} />
                <Text style={styles.dateBtnText} numberOfLines={1}>
                  {t("concierge.details.dateTo", { date: dateEnd.toLocaleDateString(appLocale, { weekday: "short", month: "short", day: "numeric", year: "numeric" }) })}
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
                  <Text style={styles.datePickerDoneText}>{t("common.done")}</Text>
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
                  <Text style={styles.datePickerDoneText}>{t("common.done")}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          <Text style={styles.label}>{t("concierge.details.budget")}</Text>
          <View style={styles.budgetAmountRow}>
            <TextInput
              style={styles.budgetAmountInput}
              placeholder={t("concierge.form.amountPlaceholder")}
              placeholderTextColor={theme.colors.textMuted}
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
              <Ionicons name="chevron-down" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Modal visible={showCurrencyPicker} transparent animationType="fade">
            <Pressable style={styles.pickerOverlay} onPress={() => setShowCurrencyPicker(false)}>
              <View style={styles.pickerSheet}>
                <Text style={styles.pickerTitle}>{t("concierge.details.currency")}</Text>
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
              <Text style={styles.label}>{t("concierge.form.partOfDay")}</Text>
              <View style={styles.freeWhenRow}>
                {(["any", "morning", "lunchtime", "afternoon", "evening"] as const).map((key) => (
                  <Chip
                    key={key}
                    label={t(`concierge.timeOfDay.${key === "lunchtime" ? "lunch" : key}`)}
                    selected={timePreference === key}
                    onPress={() => {
                      setTimePreference(key);
                      setAvailableSlots([]);
                    }}
                  />
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
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <>
                    <Ionicons name="calendar-outline" size={18} color={availableSlots.length > 0 ? theme.colors.onPrimary : theme.colors.primary} />
                    <Text style={[styles.whenFreeBtnText, availableSlots.length > 0 && styles.whenFreeBtnTextActive]}>
                      {availableSlots.length > 0
                        ? t("concierge.form.whenFreeCount", { count: availableSlots.length })
                        : t("concierge.form.whenFree")}
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
                  <TouchableOpacity onPress={() => handleSelectPartner(null)} hitSlop={8} accessibilityLabel={t("concierge.form.clearPartner")}>
                    <Ionicons name="close-circle" size={24} color={theme.colors.textMuted} />
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
                  <Ionicons name="person-add-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.partnerBtnText}>{t("concierge.flow.header.invite")}</Text>
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
                        {mode === "romance" ? t("modes.matches") : t("modes.connections")}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => { Haptics.selectionAsync(); setInviteSource("search"); }}
                      style={[styles.inviteSourceTab, inviteSource === "search" && styles.inviteSourceTabActive]}
                    >
                      <Text style={[styles.inviteSourceTabText, inviteSource === "search" && styles.inviteSourceTabTextActive]}>{t("common.search")}</Text>
                    </TouchableOpacity>
                  </View>
                  {inviteSource === "search" && (
                    <TextInput
                      style={[styles.input, { marginBottom: 8 }]}
                      placeholder={t("concierge.form.searchByName")}
                      placeholderTextColor={theme.colors.textMuted}
                      value={inviteSearchQuery}
                      onChangeText={setInviteSearchQuery}
                      autoCapitalize="words"
                    />
                  )}
                  <ScrollView style={styles.partnerList} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                    {inviteSource === "matches"
                      ? (partnersLoading ? (
                          <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 12 }} />
                        ) : partners.length === 0 ? (
                          <Text style={styles.inviteEmptyText}>
                            {mode === "romance" ? t("concierge.form.noMatches") : t("concierge.form.noConnections")}
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
                          <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 12 }} />
                        ) : inviteSearchQuery.trim().length < 2 ? (
                          <Text style={styles.inviteEmptyText}>{t("concierge.form.minChars", { count: 2 })}</Text>
                        ) : inviteSearchResults.length === 0 ? (
                          <Text style={styles.inviteEmptyText}>{t("concierge.form.noOneFound")}</Text>
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
      </ScrollView>

      {/* Sticky footer CTA so form is always usable + scrolling stays vertical */}
      <View style={[styles.footer, { paddingBottom: Math.max(12, insets.bottom + 10) }]}>
        <PrimaryButton
          title={source_screen === "chats" ? t("concierge.form.submitChats") : t("concierge.form.submit")}
          onPress={handleSubmit}
          loading={loading}
          disabled={!canSubmit}
        />
      </View>
    </View>
  );
}

function makeStyles(theme: AppTheme, mode: Mode) {
  const modeBg = theme.modeAccent(mode).bg;
  return StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: theme.spacing.xxl, paddingBottom: theme.spacing.lg },
  modeLabelRow: { marginBottom: theme.spacing.sm },
  modeLabelText: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    fontWeight: "600",
  },
  chipsScroll: { marginHorizontal: -theme.spacing.xxl, marginBottom: theme.spacing.md },
  chipsContent: { paddingHorizontal: theme.spacing.xxl, flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  recentWrap: { marginBottom: theme.spacing.lg },
  recentLabel: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    fontWeight: "600",
    marginBottom: theme.spacing.sm,
  },
  recentChipsRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  freeWhenRow: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  whenFreeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.backgroundMuted,
    marginBottom: theme.spacing.lg,
  },
  whenFreeBtnActive: { backgroundColor: theme.colors.primary },
  whenFreeBtnText: { ...theme.type.caption, color: theme.colors.primary, fontWeight: "600" },
  whenFreeBtnTextActive: { color: theme.colors.onPrimary },
  hint: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  fieldLabel: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    fontWeight: "600",
    marginBottom: theme.spacing.sm,
  },
  selectedTopicPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.pill,
    backgroundColor: modeBg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  selectedTopicText: {
    ...theme.type.caption,
    color: theme.colors.textPrimary,
    fontWeight: "700",
    flex: 1,
  },
  promptRow: {
    marginBottom: theme.spacing.md,
  },
  promptInput: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.backgroundMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: theme.spacing.sm,
  },
  promptPrimary: {
    minHeight: 92,
  },
  promptSecondary: {
    minHeight: 64,
  },
  voiceInputBtn: {
    alignSelf: "flex-start",
    paddingLeft: 0,
  },
  voiceModalBackdrop: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.xxl,
  },
  voiceModalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xxl,
    width: "100%",
    maxWidth: 360,
  },
  voiceModalTitle: {
    ...theme.type.h3,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.sm,
  },
  voiceModalHint: {
    ...theme.type.caption,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.lg,
  },
  voiceModalInput: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: theme.radii.md,
    padding: theme.spacing.lg,
    minHeight: 60,
    textAlignVertical: "top",
    marginBottom: theme.spacing.xl,
  },
  voiceModalActions: {
    flexDirection: "row",
    gap: theme.spacing.md,
    justifyContent: "flex-end",
  },
  voiceModalCancel: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
  voiceModalCancelText: {
    ...theme.type.caption,
    color: theme.colors.textMuted,
  },
  voiceModalDone: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
  },
  voiceModalDoneText: {
    ...theme.type.caption,
    color: theme.colors.onPrimary,
    fontWeight: "600",
  },
  detailsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  detailsToggleText: {
    ...theme.type.caption,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  details: { marginBottom: theme.spacing.lg },
  label: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  input: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  locationWrap: {
    marginBottom: theme.spacing.md,
    position: "relative",
  },
  locationInput: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    paddingRight: 40,
  },
  locationInputSpinner: {
    position: "absolute",
    right: theme.spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  locationSuggestionsList: {
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.elevation(2),
    overflow: "hidden",
  },
  locationSuggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  locationSuggestionText: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  dropdownTriggerFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  dropdownTriggerText: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing.xxxl,
    maxHeight: "70%",
  },
  pickerTitle: {
    ...theme.type.body,
    fontWeight: "600",
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.md,
  },
  pickerItem: {
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.sm,
    marginBottom: theme.spacing.xs,
  },
  pickerItemActive: { backgroundColor: theme.colors.primary },
  pickerItemText: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
  },
  pickerItemTextActive: { color: theme.colors.onPrimary, fontWeight: "600" },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  dateBtnText: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
  },
  dateBtnSecond: { marginTop: theme.spacing.sm },
  datePickerWrap: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  datePickerDone: { alignSelf: "flex-end", marginTop: theme.spacing.sm },
  datePickerDoneText: {
    ...theme.type.button,
    color: theme.colors.primary,
  },
  dateRangeRow: { marginBottom: theme.spacing.md },
  budgetAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  budgetAmountInput: {
    flex: 1,
    ...theme.type.body,
    color: theme.colors.textPrimary,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    marginRight: theme.spacing.sm,
  },
  currencyDropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    minWidth: 72,
  },
  currencyDropdownText: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    fontWeight: "600",
  },
  partnerSelectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  partnerName: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  partnerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  partnerBtnText: {
    ...theme.type.caption,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  invitePickerWrap: {
    backgroundColor: theme.colors.backgroundMuted,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    maxHeight: 220,
  },
  inviteSourceRow: { flexDirection: "row", marginBottom: theme.spacing.sm, gap: theme.spacing.sm },
  inviteSourceTab: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surface,
  },
  inviteSourceTabActive: { backgroundColor: theme.colors.primary },
  inviteSourceTabText: { ...theme.type.caption, color: theme.colors.textSecondary, fontWeight: "600" },
  inviteSourceTabTextActive: { color: theme.colors.onPrimary },
  inviteEmptyText: {
    ...theme.type.caption,
    color: theme.colors.textMuted,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xs,
  },
  partnerList: {
    maxHeight: 160,
    marginBottom: 0,
  },
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
  },
  partnerRowName: {
    ...theme.type.body,
    color: theme.colors.textPrimary,
    flex: 1,
  },
  weatherRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  weatherText: {
    ...theme.type.caption,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  footer: {
    paddingTop: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xxl,
    backgroundColor: theme.colors.backgroundMuted,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  });
}
