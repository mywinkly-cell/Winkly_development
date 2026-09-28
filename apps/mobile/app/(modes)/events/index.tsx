// ────────────────────────────────────────────────
// Winkly Events Mode – Home: the Events catalogue
//
// One place instead of five apps: events and activities from connected platforms
// (Ticketmaster, Meetup, Eventbrite, GetYourGuide…) plus events published on Winkly,
// pre-filtered for you (interests, location) with the reason shown on each card.
// The same event sold on several sites is one card with every booking option.
//
// Events here are *ideas*: "+ Plan" turns one into a plan in your Planner — for
// yourself, a date, a meetup or business. Private users plan in the Planner; only
// business accounts publish events (Create event). Sponsored venue offers are mixed
// in, always labelled. See docs/EVENTS_CATALOG.md.
// ────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ModeHeader } from "@/components/layout/ModeHeader";
import { EventsBottomNav } from "@/components/layout/EventsBottomNav";
import { EventCard, type EventCardItem } from "@/components/ui/EventCard";
import { SponsoredOfferCard } from "@/components/ui/SponsoredOfferCard";
import { Card, Chip, PrimaryButton, TextButton } from "@/components/ds";
import { useAppTheme, type AppTheme } from "@/constants/design-system";
import { getDeviceCoordsIfPermitted } from "@/lib/location/deviceLocation";
import { useDefaultLocation } from "@/lib/ai/useDefaultCity";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";
import { PlanItBar } from "@/components/ai/PlanItBar";
import { PLAN_IT_ENTRY_ENABLED } from "@/config/flags";
import { formatAppDate, useAppLocaleTag } from "@/lib/i18n/appLocale";
import { saveVenueToWishlist } from "@/lib/wishlistStore";
import { newPlanHref } from "@/lib/planner/newPlan";
import {
  CATALOG_VENUE_TYPES,
  catalogRange,
  getMyInterestTags,
  interleaveSponsored,
  loadCatalog,
  loadSponsoredOffers,
  pickSponsoredOffers,
  rememberCatalogItems,
  type SponsoredOffer,
  type VenueType,
} from "@/lib/events/catalog";
import type { ExternalEventsStatus } from "@/lib/externalEvents";

type TimeRange = "day" | "week" | "month";

/** Events published on Winkly (business accounts) → catalogue cards. */
function winklyRowToCard(row: Record<string, unknown>): EventCardItem {
  const imageUrl = (row.cover_url ?? row.cover_image_uri) as string | null;
  return {
    id: `winkly_${row.id as string}`,
    title: (row.title as string) ?? "",
    description: (row.description as string) ?? null,
    imageUrl: imageUrl ?? null,
    startAt: (row.starts_at as string) ?? new Date().toISOString(),
    endAt: (row.ends_at as string | null) ?? null,
    location: (row.city ?? row.location) as string | null,
    city: (row.city as string | null) ?? null,
    venueName: (row.venue_name as string) ?? null,
    category: (row.category as string) ?? null,
    winklyEventId: row.id as string,
    offers: [],
  };
}

export default function EventsHome() {
  const router = useRouter();
  const theme = useAppTheme();
  const styles = createStyles(theme);
  const { t, i18n } = useTranslation();
  const locale = useAppLocaleTag();
  const { accountType } = useAuth();
  const { city: profileCity } = useDefaultLocation();
  const isBusinessAccount = accountType === "business";

  const [timeRange, setTimeRange] = useState<TimeRange>("week");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [venueType, setVenueType] = useState<VenueType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Where: "near me" (device location) or a city the user typed.
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [coordsChecked, setCoordsChecked] = useState(false);
  const [chosenCity, setChosenCity] = useState<string | null>(null);
  const [editingCity, setEditingCity] = useState(false);
  const [cityDraft, setCityDraft] = useState("");

  const [interests, setInterests] = useState<string[]>([]);
  const [items, setItems] = useState<EventCardItem[]>([]);
  const [winklyEvents, setWinklyEvents] = useState<EventCardItem[]>([]);
  const [sponsored, setSponsored] = useState<SponsoredOffer[]>([]);
  const [status, setStatus] = useState<ExternalEventsStatus | "loading">("loading");
  const [refreshing, setRefreshing] = useState(false);

  const { from, to } = useMemo(() => catalogRange(timeRange, selectedDate), [timeRange, selectedDate]);

  // Location + interests first, so the first load is already personal (no double fetch).
  useEffect(() => {
    void Promise.all([getDeviceCoordsIfPermitted(), getMyInterestTags()]).then(([c, tags]) => {
      setCoords(c);
      setInterests(tags);
      setCoordsChecked(true);
    });
  }, []);

  // With no device location, browse the profile city by default.
  const effectiveCity = chosenCity ?? (coords ? null : profileCity);
  const whereLabel = effectiveCity ?? t("catalog.nearMe");

  const load = useCallback(async () => {
    if (!coordsChecked) return;
    setStatus("loading");
    const [catalog, winklyRows] = await Promise.all([
      loadCatalog({
        coords,
        city: effectiveCity,
        from: from.toISOString(),
        to: to.toISOString(),
        venueType,
        interests,
        language: i18n.language,
      }),
      supabase
        .from("events")
        .select("*")
        .gte("starts_at", from.toISOString())
        .lte("starts_at", to.toISOString())
        .order("starts_at", { ascending: true })
        .limit(40)
        .then(({ data, error }) => (error ? [] : ((data ?? []) as Record<string, unknown>[]))),
    ]);
    const winkly = winklyRows
      .filter((r) => !effectiveCity || String(r.city ?? "").toLowerCase().includes(effectiveCity.toLowerCase()))
      .map(winklyRowToCard);
    rememberCatalogItems(winkly);
    setWinklyEvents(winkly);
    setItems(catalog.items);
    setStatus(catalog.status);
    setRefreshing(false);
  }, [coordsChecked, coords, effectiveCity, from, to, venueType, interests, i18n.language]);

  useEffect(() => {
    void load();
  }, [load]);

  const sponsoredCity = effectiveCity ?? profileCity;
  useEffect(() => {
    void loadSponsoredOffers(sponsoredCity).then(setSponsored);
  }, [sponsoredCity]);

  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = useCallback(
    (e: EventCardItem) =>
      !q ||
      [e.title, e.location, e.venueName, e.category, e.hostName].some((x) => (x ?? "").toLowerCase().includes(q)),
    [q]
  );
  const visibleItems = useMemo(() => items.filter(matchesSearch), [items, matchesSearch]);
  const visibleWinkly = useMemo(() => winklyEvents.filter(matchesSearch), [winklyEvents, matchesSearch]);
  const feed = useMemo(
    () =>
      interleaveSponsored(
        visibleItems,
        q ? [] : pickSponsoredOffers(sponsored, { interests, venueType, max: 2 })
      ),
    [visibleItems, sponsored, interests, venueType, q]
  );

  const openItem = useCallback(
    (item: EventCardItem) => {
      if (item.winklyEventId) {
        router.push(`/(modes)/events/event-details?event_id=${item.winklyEventId}`);
      } else {
        router.push({ pathname: "/(modes)/events/catalog-item", params: { id: item.id } });
      }
    },
    [router]
  );

  const planItem = useCallback(
    (item: EventCardItem) => {
      router.push(
        newPlanHref({
          title: item.title,
          startsAt: item.kind === "activity" ? null : item.startAt,
          endsAt: item.kind === "activity" ? null : item.endAt ?? null,
          location: [item.venueName, item.location].filter(Boolean).join(", "),
          imageUrl: item.imageUrl ?? null,
          catalogId: item.id,
          source: "catalog",
        })
      );
    },
    [router]
  );

  const planSponsored = useCallback(
    (offer: SponsoredOffer) => {
      router.push(
        newPlanHref({
          title: offer.venueName,
          location: [offer.venueName, offer.address].filter(Boolean).join(", "),
          imageUrl: offer.imageUrl,
          placeId: offer.placeId,
          sponsoredOfferId: offer.id,
          source: "sponsored",
        })
      );
    },
    [router]
  );

  const saveVenue = useCallback(
    async (input: {
      title: string;
      address?: string | null;
      city?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      imageUrl?: string | null;
      sourceUrl?: string | null;
      placeId?: string | null;
    }) => {
      try {
        const { alreadySaved } = await saveVenueToWishlist({
          title: input.title,
          mode: "events",
          address: input.address ?? undefined,
          city: input.city ?? undefined,
          latitude: input.latitude ?? undefined,
          longitude: input.longitude ?? undefined,
          imageUrl: input.imageUrl ?? undefined,
          sourceUrl: input.sourceUrl ?? undefined,
          placeId: input.placeId ?? undefined,
          savedFrom: "venue_card",
        });
        Alert.alert(
          alreadySaved ? t("catalog.alreadySavedTitle") : t("catalog.savedTitle"),
          t("catalog.savedBody", { place: input.title })
        );
      } catch {
        Alert.alert(t("catalog.saveFailedTitle"), t("catalog.saveFailed"));
      }
    },
    [t]
  );

  const saveItemVenue = useCallback(
    (item: EventCardItem) =>
      saveVenue({
        title: item.venueName ?? item.location ?? item.title,
        address: item.location,
        city: item.city,
        latitude: item.latitude,
        longitude: item.longitude,
        sourceUrl: item.externalUrl,
      }),
    [saveVenue]
  );

  const saveSponsoredVenue = useCallback(
    (offer: SponsoredOffer) =>
      saveVenue({
        title: offer.venueName,
        address: offer.address,
        city: offer.city,
        latitude: offer.latitude,
        longitude: offer.longitude,
        imageUrl: offer.imageUrl,
        sourceUrl: offer.linkUrl,
        placeId: offer.placeId,
      }),
    [saveVenue]
  );

  const dateLabel = useMemo(() => {
    if (timeRange === "day") return formatAppDate(selectedDate, undefined, locale);
    if (timeRange === "week") {
      const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
      const { from: f, to: tt } = catalogRange("week", selectedDate);
      return t("catalog.rangeLabel", {
        from: formatAppDate(f, opts, locale),
        to: formatAppDate(tt, opts, locale),
      });
    }
    return formatAppDate(selectedDate, { month: "long", year: "numeric" }, locale);
  }, [timeRange, selectedDate, locale, t]);

  const submitCity = () => {
    const c = cityDraft.trim();
    setChosenCity(c || null);
    setEditingCity(false);
  };

  const loading = status === "loading" && !refreshing;

  return (
    <View style={styles.screen}>
      <ModeHeader currentMode="events" rightSlot="filterSettings" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {PLAN_IT_ENTRY_ENABLED ? <PlanItBar mode="events" style={styles.planItBar} /> : null}
        <Text style={styles.pageTitle}>{t("catalog.title")}</Text>
        <Text style={styles.pageSubtitle}>{t("catalog.subtitle")}</Text>

        {/* ─── Where ─── */}
        {editingCity ? (
          <View style={styles.cityEditRow}>
            <TextInput
              value={cityDraft}
              onChangeText={setCityDraft}
              placeholder={t("catalog.cityPlaceholder")}
              placeholderTextColor={theme.colors.textMuted}
              style={styles.cityInput}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={submitCity}
            />
            <TextButton title={t("common.done")} onPress={submitCity} />
          </View>
        ) : (
          <View style={styles.whereRow}>
            <Pressable
              onPress={() => {
                setCityDraft(chosenCity ?? "");
                setEditingCity(true);
              }}
              style={styles.wherePill}
              accessibilityRole="button"
              accessibilityLabel={t("catalog.changeCityA11y", { place: whereLabel })}
            >
              <Ionicons name={effectiveCity ? "location-outline" : "navigate-outline"} size={16} color={theme.colors.textPrimary} />
              <Text style={styles.wherePillText} numberOfLines={1}>{whereLabel}</Text>
              <Ionicons name="chevron-down" size={14} color={theme.colors.textMuted} />
            </Pressable>
            {chosenCity && coords ? (
              <TextButton title={t("catalog.nearMe")} onPress={() => setChosenCity(null)} />
            ) : null}
          </View>
        )}

        {/* ─── When ─── */}
        <View style={styles.rangeRow}>
          {(["day", "week", "month"] as const).map((r) => (
            <Chip
              key={r}
              label={t(r === "day" ? "catalog.day" : r === "week" ? "catalog.week" : "catalog.month")}
              mode="events"
              selected={timeRange === r}
              onPress={() => setTimeRange(r)}
            />
          ))}
          <Pressable
            onPress={() => setShowDatePicker(true)}
            style={styles.dateBtn}
            accessibilityRole="button"
            accessibilityLabel={t("catalog.pickDateA11y")}
          >
            <Ionicons name="calendar-outline" size={18} color={theme.colors.textPrimary} />
            <Text style={styles.dateBtnText}>{dateLabel}</Text>
          </Pressable>
        </View>

        {showDatePicker && (
          <View style={{ marginBottom: theme.spacing.md }}>
            {Platform.OS === "ios" && (
              <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: theme.spacing.sm }}>
                <TextButton title={t("common.done")} onPress={() => setShowDatePicker(false)} style={{ paddingHorizontal: 0 }} />
              </View>
            )}
            <DateTimePicker
              value={selectedDate}
              mode="date"
              minimumDate={new Date()}
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_, d) => {
                if (d) setSelectedDate(d);
                if (Platform.OS === "android") setShowDatePicker(false);
              }}
            />
          </View>
        )}

        {/* ─── What kind of place ─── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: theme.spacing.lg }}
          contentContainerStyle={styles.categoryRow}
        >
          <Chip label={t("catalog.typeAll")} mode="events" selected={venueType === null} onPress={() => setVenueType(null)} />
          {CATALOG_VENUE_TYPES.map((vt) => (
            <Chip
              key={vt}
              label={t(`catalog.type.${vt}`)}
              mode="events"
              selected={venueType === vt}
              onPress={() => setVenueType(vt)}
            />
          ))}
        </ScrollView>

        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={20} color={theme.colors.textMuted} style={{ marginRight: theme.spacing.sm }} />
          <TextInput
            placeholder={t("catalog.searchPlaceholder")}
            placeholderTextColor={theme.colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={theme.modeAccent("events").primary} style={{ marginVertical: theme.spacing.xxl }} />
        ) : (
          <>
            {visibleWinkly.length > 0 ? (
              <View style={styles.strip}>
                <Text style={styles.stripTitle}>{t("catalog.onWinkly")}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: theme.spacing.xl }}>
                  {visibleWinkly.map((item) => (
                    <EventCard key={item.id} item={item} variant="strip" onPress={openItem} onPlan={planItem} />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <Text style={styles.stripTitle}>
              {interests.length ? t("catalog.pickedForYou") : t("catalog.whatsOn")}
            </Text>
            {feed.length === 0 ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {status === "unavailable"
                    ? t("catalog.unavailable")
                    : q
                      ? t("catalog.noSearchResults")
                      : t("catalog.empty")}
                </Text>
              </Card>
            ) : (
              feed.map((row) =>
                row.kind === "item" ? (
                  <EventCard
                    key={row.item.id}
                    item={row.item}
                    onPress={openItem}
                    onPlan={planItem}
                    onSaveVenue={saveItemVenue}
                  />
                ) : (
                  <SponsoredOfferCard
                    key={`sp_${row.offer.id}`}
                    offer={row.offer}
                    onPlan={planSponsored}
                    onSave={saveSponsoredVenue}
                  />
                )
              )
            )}
          </>
        )}

        {isBusinessAccount ? (
          <Card style={styles.ctaCard}>
            <Text style={styles.ctaTitle}>{t("catalog.hostTitle")}</Text>
            <Text style={styles.ctaBody}>{t("catalog.hostBody")}</Text>
            <PrimaryButton
              title={t("events.createEvent")}
              onPress={() => router.push("/(modes)/events/create-event")}
              style={{ backgroundColor: theme.colors.onPrimary }}
              textStyle={{ color: theme.colors.primary }}
            />
          </Card>
        ) : null}
      </ScrollView>

      <EventsBottomNav />
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return {
    screen: { flex: 1, backgroundColor: theme.colors.background },
    scrollContent: { padding: theme.spacing.xl, paddingBottom: 120 },
    planItBar: { marginBottom: theme.spacing.xl },
    pageTitle: { ...theme.type.h1, fontFamily: theme.type.h1.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.sm },
    pageSubtitle: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary, marginBottom: theme.spacing.lg },
    whereRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: theme.spacing.sm, marginBottom: theme.spacing.md },
    wherePill: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: theme.spacing.xs,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.border,
      maxWidth: "75%" as const,
    },
    wherePillText: { ...theme.type.bodyMedium, fontFamily: theme.type.bodyMedium.fontFamily, color: theme.colors.textPrimary },
    cityEditRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: theme.spacing.sm, marginBottom: theme.spacing.md },
    cityInput: {
      flex: 1,
      ...theme.type.body,
      fontFamily: theme.type.body.fontFamily,
      color: theme.colors.textPrimary,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    rangeRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, marginBottom: theme.spacing.md, gap: theme.spacing.sm },
    dateBtn: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      backgroundColor: theme.colors.backgroundMuted,
      borderRadius: theme.radii.pill,
      gap: theme.spacing.xs,
    },
    dateBtnText: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.textPrimary },
    categoryRow: { gap: theme.spacing.sm, paddingRight: theme.spacing.xl },
    searchBox: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.radii.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      marginBottom: theme.spacing.xl,
    },
    searchInput: { flex: 1, ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textPrimary },
    strip: { marginBottom: theme.spacing.xl },
    stripTitle: { ...theme.type.h3, fontFamily: theme.type.h3.fontFamily, color: theme.colors.textPrimary, marginBottom: theme.spacing.md },
    emptyCard: { padding: theme.spacing.lg, marginBottom: theme.spacing.lg },
    emptyText: { ...theme.type.body, fontFamily: theme.type.body.fontFamily, color: theme.colors.textSecondary },
    ctaCard: { backgroundColor: theme.colors.primary, alignItems: "center" as const, marginTop: theme.spacing.md },
    ctaTitle: { ...theme.type.h3, fontFamily: theme.type.h3.fontFamily, color: theme.colors.onPrimary, marginBottom: theme.spacing.sm },
    ctaBody: { ...theme.type.caption, fontFamily: theme.type.caption.fontFamily, color: theme.colors.onPrimary, marginBottom: theme.spacing.lg, textAlign: "center" as const },
  };
}
